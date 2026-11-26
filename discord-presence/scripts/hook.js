'use strict';
// Called by Claude Code hooks. Usage: node hook.js <start|working|waiting|idle|end>
// Writes a small state file per session and makes sure the daemon is running.
// Never blocks Claude: always exits 0 and prints nothing.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const C = require('./common');

const ACTIONS = new Set(['start', 'working', 'waiting', 'idle', 'end']);
const action = ACTIONS.has(process.argv[2]) ? process.argv[2] : 'idle';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const done = () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } };
    const t = setTimeout(done, 1500);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { data += d; });
    process.stdin.on('end', () => { clearTimeout(t); done(); });
    process.stdin.on('error', () => { clearTimeout(t); done(); });
  });
}

function startDaemon() {
  if (C.daemonPid()) return;
  const child = spawn(process.execPath, [path.join(__dirname, 'daemon.js')], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

(async () => {
  try {
    C.ensureDirs();
    const input = await readStdin();
    if (!input || typeof input !== 'object' || !input.session_id) return; // nothing to track
    const id = C.safeId(input.session_id);
    const file = path.join(C.SESSIONS_DIR, `${id}.json`);

    if (action === 'end') {
      try { fs.unlinkSync(file); } catch {}
      return;
    }

    let s = {};
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) s = parsed;
    } catch {}
    const now = Date.now();
    const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : (s.cwd || process.cwd());
    const transcriptPath = typeof input.transcript_path === 'string' ? input.transcript_path : s.transcriptPath;
    const modelId = typeof input.model === 'string'
      ? input.model
      : (input.model && typeof input.model.id === 'string' ? input.model.id : undefined);
    const rawEffort = typeof input.effort === 'string'
      ? input.effort
      : (input.effort && typeof input.effort.level === 'string' ? input.effort.level : undefined);
    const effort = rawEffort && /^[a-zA-Z]{1,20}$/.test(rawEffort) ? rawEffort : s.effort;
    const startedAt = Number.isFinite(s.startedAt) && s.startedAt > 0 ? s.startedAt : now;

    s = {
      ...s,
      sessionId: String(input.session_id),
      cwd,
      project: path.basename(cwd),
      transcriptPath,
      model: modelId || s.model,
      effort,
      startedAt,
      status: action === 'start' ? 'idle' : action,
      updatedAt: now,
    };
    C.atomicWriteFileSync(file, JSON.stringify(s), { mode: 0o600 });
    if (C.loadConfig().enabled) startDaemon();
  } catch {
    // never disturb the Claude session
  }
})().finally(() => setTimeout(() => process.exit(0), 50));
