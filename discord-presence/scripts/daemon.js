'use strict';
// Background process: keeps one Discord RPC connection and mirrors the most
// recently active Claude Code session into your Discord activity.
const fs = require('fs');
const path = require('path');
const { DiscordIPC } = require('./discord-ipc');
const C = require('./common');

const TICK_MS = 3000;
const MIN_SEND_GAP_MS = 4500;      // Discord allows ~5 activity updates / 20s
const RETRY_MS = 15000;
const EXIT_AFTER_EMPTY_MS = 20000;

try { C.ensureDirs(); } catch { process.exit(0); }

// ---- single instance -------------------------------------------------------
// The lock is created with O_EXCL so two daemons racing from two hooks cannot
// both win. A lock whose PID is dead is treated as stale and replaced.
function acquireLock() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const fd = fs.openSync(C.LOCK_FILE, 'wx', 0o600);
      try { fs.writeSync(fd, String(process.pid)); } finally { fs.closeSync(fd); }
      return true;
    } catch (e) {
      if (e.code !== 'EEXIST') return false;
      const pid = C.daemonPid();
      if (pid && pid !== process.pid) return false; // a live daemon owns it
      // No live owner: the lock is stale. Only remove it once it is not a
      // lock that another process just created and has not written yet.
      try {
        const st = fs.statSync(C.LOCK_FILE);
        if (!pid && Date.now() - st.mtimeMs < 2000) return false;
      } catch {}
      try { fs.unlinkSync(C.LOCK_FILE); } catch {}
    }
  }
  return false;
}
if (!acquireLock()) process.exit(0);

function log(...a) {
  try {
    const st = fs.existsSync(C.LOG_FILE) ? fs.statSync(C.LOG_FILE) : null;
    if (st && st.size > 256 * 1024) fs.renameSync(C.LOG_FILE, C.LOG_FILE + '.old');
    const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x)))
      .join(' ')
      .replace(/[\r\n]+/g, ' ');
    fs.appendFileSync(C.LOG_FILE, `[${new Date().toISOString()}] ${line}\n`, { mode: 0o600 });
  } catch {}
}

// ---- state -----------------------------------------------------------------
let rpc = null;
let rpcClientId = null;
let connecting = false;
let nextRetry = 0;
let lastSentJson = null;
let lastSentAt = 0;
let emptySince = null;
const modelCache = new Map(); // transcriptPath -> { size, model }

function disconnect() {
  if (rpc) {
    if (rpc.ready) { try { rpc.setActivity(null); } catch {} }
    rpc.close();
  }
  rpc = null;
  rpcClientId = null;
  lastSentJson = null;
}

async function ensureConnected(clientId) {
  if (rpc && rpc.ready && rpcClientId === clientId) return true;
  if (rpc) disconnect();
  if (connecting || Date.now() < nextRetry) return false;
  connecting = true;
  const client = new DiscordIPC(clientId);
  client.on('error', (e) => log('ipc error:', e.message));
  client.on('rpc-error', (d) => log('rpc error:', JSON.stringify(d)));
  client.on('close', () => {
    if (rpc === client) { rpc = null; rpcClientId = null; lastSentJson = null; nextRetry = Date.now() + RETRY_MS; }
  });
  try {
    await client.connect();
    rpc = client;
    rpcClientId = clientId;
    lastSentJson = null;
    log('connected to Discord');
    return true;
  } catch (e) {
    client.close();
    nextRetry = Date.now() + RETRY_MS;
    log('connect failed:', e.message);
    return false;
  } finally {
    connecting = false;
  }
}

// ---- sessions --------------------------------------------------------------
function readSessions() {
  let files = [];
  try { files = fs.readdirSync(C.SESSIONS_DIR).filter((f) => f.endsWith('.json')); } catch {}
  const out = [];
  for (const f of files) {
    const p = path.join(C.SESSIONS_DIR, f);
    try {
      // Session files are tiny; refuse anything unexpectedly large.
      if (fs.statSync(p).size > 64 * 1024) { fs.unlinkSync(p); continue; }
      const s = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (!s || typeof s !== 'object' || Array.isArray(s)) { fs.unlinkSync(p); continue; }
      s.updatedAt = Number(s.updatedAt) || 0;
      if (Date.now() - s.updatedAt > C.STALE_MS) { fs.unlinkSync(p); continue; }
      out.push(s);
    } catch {}
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

const NO_INFO = Object.freeze({ model: null, effort: null });

function lastMatch(text, re) {
  let m;
  let last = null;
  while ((m = re.exec(text)) !== null) last = m[1];
  return last;
}

/** Reads the end of the transcript and returns the last model id and effort level used. */
function infoFromTranscript(file) {
  if (!file || typeof file !== 'string') return NO_INFO;
  let fd;
  try {
    const st = fs.statSync(file);
    if (!st.isFile()) return NO_INFO;
    const cached = modelCache.get(file);
    if (cached && cached.size === st.size) return cached;
    const len = Math.min(st.size, 256 * 1024);
    const buf = Buffer.alloc(len);
    if (len > 0) {
      fd = fs.openSync(file, 'r');
      let read = 0;
      while (read < len) {
        const n = fs.readSync(fd, buf, read, len - read, st.size - len + read);
        if (!n) break;
        read += n;
      }
    }
    const text = buf.toString('utf8');
    // Assistant entries carry e.g. "model":"claude-opus-5-5" and "effort":"high".
    const model = lastMatch(text, /"model"\s*:\s*"([^"]*claude[^"]*)"/g) || (cached && cached.model) || null;
    const effort = lastMatch(text, /"effort"\s*:\s*"([a-zA-Z]{1,20})"/g) || (cached && cached.effort) || null;
    const info = { size: st.size, model, effort };
    // Keep the cache bounded when many transcripts are seen over time.
    if (modelCache.size >= 200) modelCache.delete(modelCache.keys().next().value);
    modelCache.set(file, info);
    return info;
  } catch {
    return NO_INFO;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

function cleanText(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(str, fallback) {
  let s = cleanText(str);
  if (s.length < 2) s = cleanText(fallback);
  if (s.length < 2) s = 'Claude Code';
  return s.length > 128 ? s.slice(0, 127) + '…' : s;
}

function buildActivity(cfg, session, count) {
  const info = infoFromTranscript(session.transcriptPath);

  let model = typeof cfg.model === 'string' ? cfg.model : '';
  if (!model || model === 'auto') {
    const detected = info.model || session.model;
    model = C.prettyModel(typeof detected === 'string' ? detected : '') || 'Claude';
  }

  let effort = '';
  if (cfg.showEffort) {
    const chosen = typeof cfg.effort === 'string' ? cfg.effort.trim() : '';
    const raw = !chosen || chosen.toLowerCase() === 'auto' ? (info.effort || session.effort) : chosen;
    effort = C.prettyEffort(typeof raw === 'string' ? raw : '');
  }

  const project = typeof session.project === 'string' ? session.project : '';
  const where = cfg.showProject && project ? ` on ${project}` : '';
  const whereIn = cfg.showProject && project ? ` in ${project}` : '';
  const details = {
    working: `Working${where}`,
    waiting: `Waiting for approval${whereIn}`,
    idle: `Idle${whereIn}`,
  }[session.status] || `Coding${whereIn}`;

  const stateParts = [model];
  if (effort) stateParts.push(effort);
  if (cfg.showPlan && cfg.plan) stateParts.push(cfg.plan === 'API' ? 'API' : `Claude ${cfg.plan}`);

  const activity = {
    type: 0,
    details: clamp(details, 'Claude Code'),
    state: clamp(stateParts.join(' · '), 'Claude Code'),
    assets: {},
    instance: false,
  };
  const startedAt = Number(session.startedAt);
  if (cfg.showElapsed && Number.isFinite(startedAt) && startedAt > 0) {
    activity.timestamps = { start: Math.floor(startedAt) };
  }
  if (cfg.largeImage) {
    const imageText = cleanText(cfg.largeImageText) || 'Claude Code';
    activity.assets.large_image = cfg.largeImage;
    activity.assets.large_text = clamp(
      count > 1 ? `${imageText} · ${count} Sessions` : imageText, 'Claude Code');
  }
  if (cfg.smallImage) {
    activity.assets.small_image = cfg.smallImage;
    const smallText = cfg.showPlan && cfg.plan ? `Claude ${cfg.plan}` : model;
    activity.assets.small_text = clamp(smallText, 'Claude');
  }
  if (!Object.keys(activity.assets).length) delete activity.assets;
  const buttonLabel = cleanText(cfg.buttonLabel).slice(0, 32);
  const buttonUrl = cleanText(cfg.buttonUrl).slice(0, 512);
  if (buttonLabel && /^https?:\/\//i.test(buttonUrl)) {
    activity.buttons = [{ label: buttonLabel, url: buttonUrl }];
  }
  return activity;
}

// ---- main loop -------------------------------------------------------------
let busy = false;
async function tick() {
  if (busy) return;
  busy = true;
  try {
    const cfg = C.loadConfig();
    const sessions = readSessions();

    if (!sessions.length) {
      emptySince = emptySince || Date.now();
      // Respect the update rate limit and retry until the clear was sent.
      if (rpc && lastSentJson !== 'null' && Date.now() - lastSentAt >= MIN_SEND_GAP_MS) {
        rpc.setActivity(null);
        lastSentJson = 'null';
        lastSentAt = Date.now();
      }
      if (Date.now() - emptySince > EXIT_AFTER_EMPTY_MS) return shutdown('no sessions');
      return;
    }
    emptySince = null;

    if (!cfg.enabled || !cfg.clientId) { if (rpc) disconnect(); return; }
    if (!(await ensureConnected(String(cfg.clientId)))) return;

    const activity = buildActivity(cfg, sessions[0], sessions.length);
    const json = JSON.stringify(activity);
    if (json === lastSentJson || Date.now() - lastSentAt < MIN_SEND_GAP_MS) return;
    rpc.setActivity(activity);
    lastSentJson = json;
    lastSentAt = Date.now();
  } catch (e) {
    log('tick error:', e.stack || e.message);
  } finally {
    busy = false;
  }
}

function shutdown(reason) {
  log('shutdown:', reason);
  disconnect();
  try { if (fs.readFileSync(C.LOCK_FILE, 'utf8').trim() === String(process.pid)) fs.unlinkSync(C.LOCK_FILE); } catch {}
  setTimeout(() => process.exit(0), 300);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (e) => log('uncaught:', e.stack || e.message));
process.on('unhandledRejection', (e) => log('unhandled rejection:', (e && e.stack) || String(e)));

log('daemon started, pid', process.pid);
setInterval(tick, TICK_MS);
tick();
