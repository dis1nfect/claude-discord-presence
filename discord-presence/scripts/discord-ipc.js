'use strict';
// Minimal Discord RPC client over the local IPC socket / named pipe. No dependencies.
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const MAX_FRAME = 1024 * 1024;

function candidatePaths() {
  const out = [];
  if (process.platform === 'win32') {
    for (let i = 0; i < 10; i++) out.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    return out;
  }
  const env = process.env;
  const bases = [env.XDG_RUNTIME_DIR, env.TMPDIR, env.TMP, env.TEMP, '/tmp'].filter(Boolean);
  const subs = ['', 'app/com.discordapp.Discord', 'snap.discord', '.flatpak/com.discordapp.Discord/xdg-run'];
  for (const b of bases) for (const s of subs) for (let i = 0; i < 10; i++) {
    out.push(path.join(b, s, `discord-ipc-${i}`));
  }
  return [...new Set(out)];
}

function tryConnect(p, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    let sock = null;
    let settled = false;
    let timer = null;
    let onErr = null;
    let onConnect = null;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (sock) {
        if (onErr) sock.off('error', onErr);
        if (onConnect) sock.off('connect', onConnect);
      }
      if (err) {
        if (sock) sock.destroy();
        reject(err);
      } else {
        resolve(sock);
      }
    };

    onErr = (e) => finish(e);
    onConnect = () => finish(null);
    try {
      sock = net.createConnection(p);
    } catch (e) {
      finish(e);
      return;
    }
    timer = setTimeout(() => finish(new Error('connect timeout')), timeoutMs);
    sock.once('error', onErr);
    sock.once('connect', onConnect);
  });
}

class DiscordIPC extends EventEmitter {
  constructor(clientId) {
    super();
    this.clientId = clientId;
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.ready = false;
  }

  async connect() {
    if (this.sock) this.close();
    this.buf = Buffer.alloc(0);
    this.ready = false;
    this.closedByRemote = false;
    let lastErr;
    const deadline = Date.now() + 15000;
    for (const p of candidatePaths()) {
      if (Date.now() > deadline) break;
      try {
        this.sock = await tryConnect(p);
        break;
      } catch (e) { lastErr = e; }
    }
    if (!this.sock) throw lastErr || new Error('Discord IPC not found');

    this.sock.on('data', (d) => this._onData(d));
    this.sock.on('end', () => { this.closedByRemote = true; });
    this.sock.on('close', () => { this.ready = false; this.emit('close'); });
    this.sock.on('error', (e) => this.emit('error', e));

    return new Promise((resolve, reject) => {
      let done = false;
      let timer = null;
      const finish = (err) => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        this.off('ready', onReady);
        this.off('close', onClose);
        this.off('error', onError);
        if (err) reject(err); else resolve();
      };
      const onReady = () => finish(null);
      const onClose = () => finish(new Error('Closed during handshake'));
      const onError = (e) => finish(e);
      timer = setTimeout(() => finish(new Error('Handshake timeout')), 10000);
      this.on('ready', onReady);
      this.on('close', onClose);
      this.on('error', onError);
      this._send(OP.HANDSHAKE, { v: 1, client_id: this.clientId });
    });
  }

  _send(op, data) {
    // Skip once the pipe is closing (e.g. Discord ended it): writing would only raise EPIPE.
    if (!this.sock || this.sock.destroyed || !this.sock.writable || this.closedByRemote) return;
    const json = Buffer.from(JSON.stringify(data), 'utf8');
    const header = Buffer.alloc(8);
    header.writeInt32LE(op, 0);
    header.writeInt32LE(json.length, 4);
    try { this.sock.write(Buffer.concat([header, json])); } catch {}
  }

  _onData(chunk) {
    if (!this.sock) return;
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0);
      const len = this.buf.readInt32LE(4);
      if (len < 0 || len > MAX_FRAME) {
        this.emit('error', new Error(`Invalid frame length: ${len}`));
        this.close();
        return;
      }
      if (this.buf.length < 8 + len) return;
      let msg = null;
      try { msg = JSON.parse(this.buf.subarray(8, 8 + len).toString('utf8')); } catch {}
      this.buf = this.buf.subarray(8 + len);

      if (op === OP.PING) this._send(OP.PONG, msg);
      else if (op === OP.CLOSE) {
        this.closedByRemote = true;
        this.emit('error', new Error(msg && msg.message || 'Closed by Discord'));
        this.close();
        return;
      }
      else if (op === OP.FRAME && msg) {
        if (msg.evt === 'READY') { this.ready = true; this.emit('ready', msg.data); }
        else if (msg.evt === 'ERROR') this.emit('rpc-error', msg.data);
      }
    }
  }

  setActivity(activity) {
    const nonce = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : crypto.randomBytes(16).toString('hex');
    const args = { pid: process.pid };
    // `null` is meaningful here: it clears the activity. Do not drop it.
    if (activity !== undefined) args.activity = activity;
    this._send(OP.FRAME, { cmd: 'SET_ACTIVITY', args, nonce });
  }

  close() {
    const sock = this.sock;
    if (sock) {
      try { this._send(OP.CLOSE, {}); } catch {}
    }
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.ready = false;
    if (sock) {
      const destroy = () => { try { sock.destroy(); } catch {} };
      try { sock.end(destroy); } catch { destroy(); }
      // Fallback in case the stream never finishes.
      const t = setTimeout(destroy, 500);
      if (t && typeof t.unref === 'function') t.unref();
    }
  }
}

module.exports = { DiscordIPC };
