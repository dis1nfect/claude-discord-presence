'use strict';
// Settings CLI for the Discord presence plugin.
//   node config.js show
//   node config.js plan "Max 20x"
//   node config.js model "Opus 5.5" | auto
//   node config.js client-id 123456789012345678
//   node config.js set <key> <value>
//   node config.js on | off | restart | stop
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./common');

const [cmd, ...rest] = process.argv.slice(2);
const value = rest.join(' ').trim().replace(/^["']|["']$/g, '');
let cfg;
try {
  // Strict read: if the file exists but cannot be read, stop instead of
  // saving defaults over the user's settings.
  cfg = C.readConfigStrict();
} catch (e) {
  console.error(`Konfiguration konnte nicht gelesen werden (${e.code || e.message}). Es wurde nichts geändert.`);
  console.error(`Datei: ${C.CONFIG_FILE}`);
  process.exit(1);
}

function matchFrom(list, v) {
  const norm = (x) => x.toLowerCase().replace(/[\s_-]+/g, '');
  return list.find((x) => norm(x) === norm(v)) || null;
}

function parseValue(key, v) {
  if (typeof C.DEFAULTS[key] === 'boolean') return /^(1|true|yes|ja|on|an)$/i.test(v);
  return v;
}

const STALE_LOCK_MS = 2000;

function stopDaemon() {
  const pid = C.daemonPid();
  if (!pid) {
    // Clean up a stale lock from a crashed daemon, but never a fresh one:
    // a starting daemon creates the lock first and writes its PID a moment later.
    try {
      if (Date.now() - fs.statSync(C.LOCK_FILE).mtimeMs >= STALE_LOCK_MS) fs.unlinkSync(C.LOCK_FILE);
    } catch {}
    return false;
  }
  try { process.kill(pid); } catch { return false; }
  // Wait briefly so a restart cannot race the old process.
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && C.isAlive(pid)) C.sleepSync(50);
  if (C.isAlive(pid)) return false;
  // Remove the lock only if it still names the daemon we stopped.
  try {
    if (fs.readFileSync(C.LOCK_FILE, 'utf8').trim() === String(pid)) fs.unlinkSync(C.LOCK_FILE);
  } catch {}
  return true;
}

function startDaemon() {
  if (C.daemonPid()) return;
  C.ensureDirs();
  spawn(process.execPath, [path.join(__dirname, 'daemon.js')], {
    detached: true, stdio: 'ignore', windowsHide: true,
  }).unref();
}

function clearSessions() {
  try {
    for (const f of fs.readdirSync(C.SESSIONS_DIR)) {
      if (!f.endsWith('.json')) continue;
      try { fs.unlinkSync(path.join(C.SESSIONS_DIR, f)); } catch {}
    }
  } catch {}
}

function countActiveSessions() {
  let count = 0;
  try {
    for (const f of fs.readdirSync(C.SESSIONS_DIR)) {
      if (!f.endsWith('.json')) continue;
      const p = path.join(C.SESSIONS_DIR, f);
      try {
        if (fs.statSync(p).size > 64 * 1024) continue;
        const s = JSON.parse(fs.readFileSync(p, 'utf8'));
        const updatedAt = Number(s && s.updatedAt) || 0;
        if (Date.now() - updatedAt <= C.STALE_MS) count++;
      } catch {}
    }
  } catch {}
  return count;
}

function show() {
  const pid = C.daemonPid();
  const sessions = countActiveSessions();
  console.log(JSON.stringify(cfg, null, 2));
  console.log(`\nDaemon: ${pid ? `läuft (PID ${pid})` : 'gestoppt'} · aktive Sessions: ${sessions}`);
  console.log(`Config: ${C.CONFIG_FILE}`);
  console.log(`Log:    ${C.LOG_FILE}`);
  if (!cfg.clientId) console.log('\n⚠ Keine Discord Application ID gesetzt → /discord-presence:setup');
  console.log(`\nAbos:   ${C.PLANS.join(', ')}`);
  console.log(`Modelle: ${C.MODELS.join(', ')} (oder beliebiger Text)`);
}

function printable(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ');
}

function fail(msg) { console.error(msg); process.exit(1); }

switch ((cmd || 'show').toLowerCase()) {
  case 'show':
  case 'status':
    show();
    break;

  case 'plan': {
    if (!value) fail(`Bitte ein Abo angeben: ${C.PLANS.join(', ')}`);
    cfg.plan = matchFrom(C.PLANS, value) || value;
    C.saveConfig(cfg);
    console.log(`✓ Abo gesetzt: ${printable(cfg.plan)}`);
    break;
  }

  case 'model': {
    if (!value) fail(`Bitte ein Modell angeben: ${C.MODELS.join(', ')} oder freier Text`);
    cfg.model = matchFrom(C.MODELS, value) || value;
    C.saveConfig(cfg);
    console.log(`✓ Modell gesetzt: ${printable(cfg.model)}${cfg.model === 'auto' ? ' (wird aus der Session erkannt)' : ''}`);
    break;
  }

  case 'client-id':
  case 'clientid': {
    if (!/^\d{15,22}$/.test(value)) fail('Die Application ID ist eine rein numerische ID aus dem Discord Developer Portal.');
    cfg.clientId = value;
    C.saveConfig(cfg);
    console.log(`✓ Discord Application ID gesetzt: ${value}`);
    break;
  }

  case 'set': {
    const [key, ...vals] = rest;
    // hasOwnProperty (not `in`) so inherited names like "constructor" or
    // "__proto__" cannot be written into the config.
    if (!key || !Object.prototype.hasOwnProperty.call(C.DEFAULTS, key)) {
      fail(`Unbekannter Schlüssel. Erlaubt: ${Object.keys(C.DEFAULTS).join(', ')}`);
    }
    const v = vals.join(' ').trim().replace(/^["']|["']$/g, '');
    if (key === 'clientId' && v && !/^\d{15,22}$/.test(v)) {
      fail('Die Application ID ist eine rein numerische ID aus dem Discord Developer Portal.');
    }
    if (typeof C.DEFAULTS[key] === 'boolean' && !/^(0|1|true|false|yes|no|ja|nein|on|off|an|aus)$/i.test(v)) {
      fail(`Bitte true oder false für "${key}" angeben.`);
    }
    if (key === 'plan') cfg.plan = matchFrom(C.PLANS, v) || v;
    else if (key === 'model') cfg.model = matchFrom(C.MODELS, v) || v;
    else cfg[key] = parseValue(key, v);
    C.saveConfig(cfg);
    console.log(`✓ ${key} = ${JSON.stringify(cfg[key])}`);
    break;
  }

  case 'on':
    cfg.enabled = true;
    C.saveConfig(cfg);
    startDaemon();
    console.log('✓ Discord-Status aktiviert');
    break;

  case 'off':
    cfg.enabled = false;
    C.saveConfig(cfg);
    stopDaemon();
    clearSessions();
    console.log('✓ Discord-Status deaktiviert');
    break;

  case 'restart':
    stopDaemon();
    setTimeout(() => { startDaemon(); console.log('✓ Daemon neu gestartet'); }, 500);
    break;

  case 'stop':
    console.log(stopDaemon() ? '✓ Daemon gestoppt' : 'Daemon lief nicht');
    break;

  default:
    fail(`Unbekannter Befehl "${printable(cmd)}". Befehle: show, plan, model, client-id, set, on, off, restart, stop`);
}
