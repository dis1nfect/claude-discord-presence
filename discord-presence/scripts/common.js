'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_DIR = path.join(os.homedir(), '.claude', 'discord-presence');
const CONFIG_FILE = path.join(BASE_DIR, 'config.json');
const SESSIONS_DIR = path.join(BASE_DIR, 'sessions');
const LOCK_FILE = path.join(BASE_DIR, 'daemon.pid');
const LOG_FILE = path.join(BASE_DIR, 'daemon.log');

const PLANS = ['Free', 'Pro', 'Max 5x', 'Max 20x', 'Team', 'Enterprise', 'API'];
const MODELS = ['auto', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5', 'Fable 5.2'];
// Session files that have not been touched for this long are considered stale.
const STALE_MS = 12 * 60 * 60 * 1000;

const DEFAULTS = {
  enabled: true,
  // Application ID from https://discord.com/developers/applications
  clientId: '',
  plan: 'Pro',
  // "auto" = read the model actually used from the session transcript
  model: 'auto',
  showProject: true,
  showElapsed: true,
  showPlan: true,
  // Asset key uploaded under "Rich Presence > Art Assets" or an https:// image URL
  largeImage: 'claude',
  largeImageText: 'Claude Code',
  smallImage: '',
  // Button shown under the activity (optional)
  buttonLabel: '',
  buttonUrl: '',
};

function ensureDirs() {
  fs.mkdirSync(BASE_DIR, { recursive: true, mode: 0o700 });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true, mode: 0o700 });
  // Tighten permissions on directories that already existed.
  try { fs.chmodSync(BASE_DIR, 0o700); } catch {}
  try { fs.chmodSync(SESSIONS_DIR, 0o700); } catch {}
}

/** Writes via a temp file + rename so readers never see a half-written file. */
function atomicWriteFileSync(file, data, options) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tmp, data, options);
    withFsRetry(() => fs.renameSync(tmp, file));
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

const TRANSIENT_FS_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES']);

function sleepSync(ms) {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {}
}

/** Runs fn, retrying briefly on errors Windows raises while AV/indexers hold a file. */
function withFsRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (e) {
      if (attempt >= 10 || !TRANSIENT_FS_ERRORS.has(e && e.code)) throw e;
      sleepSync(20 * (attempt + 1));
    }
  }
}

/**
 * Reads the config strictly. Returns defaults only when the file does not
 * exist; any other problem throws so callers never overwrite real settings
 * with defaults.
 */
function readConfigStrict() {
  let text;
  try {
    if (withFsRetry(() => fs.statSync(CONFIG_FILE)).size > 1024 * 1024) {
      throw new Error(`${CONFIG_FILE} ist größer als 1 MB`);
    }
    text = withFsRetry(() => fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    if (e && e.code === 'ENOENT') return { ...DEFAULTS };
    throw e;
  }
  const raw = JSON.parse(text.replace(/^﻿/, ''));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${CONFIG_FILE} enthält kein JSON-Objekt`);
  }
  // Only accept known keys with the expected primitive type.
  const cfg = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    // A numeric Application ID loses precision in JSON.parse (> 2^53), so take
    // its digits straight from the file text instead.
    if (key === 'clientId' && typeof raw[key] === 'number') {
      const m = text.match(/"clientId"\s*:\s*(\d{15,22})\b/);
      if (m) cfg[key] = m[1];
      continue;
    }
    if (typeof raw[key] !== typeof DEFAULTS[key]) continue;
    cfg[key] = raw[key];
  }
  return cfg;
}

/** Lenient read for the hook and daemon: falls back to defaults, never writes. */
function loadConfig() {
  try {
    return readConfigStrict();
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(cfg) {
  ensureDirs();
  atomicWriteFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function isAlive(pid) {
  pid = Number(pid);
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function daemonPid() {
  try {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
    return isAlive(pid) ? pid : null;
  } catch {
    return null;
  }
}

function safeId(id) {
  const safe = String(id || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
  return safe || 'unknown';
}

/** "claude-opus-5-5" -> "Opus 5.5", "claude-3-5-sonnet-20241022" -> "Sonnet 3.5" */
function prettyModel(id) {
  if (!id) return '';
  let s = String(id).toLowerCase().replace(/\[.*?\]/g, '').replace(/^.*?claude-/, '');
  s = s.replace(/-v\d+(:\d+)?$/, '').replace(/-\d{8}$/, '');
  const parts = s.split('-');
  const families = ['opus', 'sonnet', 'haiku', 'fable', 'instant'];
  const fam = parts.find((p) => families.includes(p));
  const nums = parts.filter((p) => /^\d+$/.test(p));
  if (!fam) return id;
  const name = fam[0].toUpperCase() + fam.slice(1);
  return nums.length ? `${name} ${nums.join('.')}` : name;
}

module.exports = {
  BASE_DIR, CONFIG_FILE, SESSIONS_DIR, LOCK_FILE, LOG_FILE,
  PLANS, MODELS, DEFAULTS, STALE_MS,
  ensureDirs, atomicWriteFileSync, readConfigStrict, loadConfig, saveConfig, sleepSync, withFsRetry, isAlive, daemonPid, safeId, prettyModel,
};
