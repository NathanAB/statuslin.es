#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const STATE_FILE = path.join(os.tmpdir(), 'claude-status-line-state.json');
const AUTOCOMPACT_BUFFER_TOKENS = 33_000;
const WARN_TOKENS = 60_000;
const COMPACT_TOKENS = 80_000;

const RST = '\x1b[0m';
const DIM = '\x1b[38;5;238m';
const MUTED = '\x1b[38;5;245m';

function formatDuration(epoch) {
  if (!epoch) return '';
  const diff = Math.max(0, Math.round(epoch - Date.now() / 1000));
  if (diff <= 0) return 'now';
  if (diff < 60) return '<1m';
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}

function rateLimitColor(pct) {
  return pct > 80 ? '\x1b[31m' : pct > 50 ? '\x1b[33m' : '\x1b[32m';
}

function formatRateLimit(rl, icon) {
  if (rl?.used_percentage == null) return '';
  const pct = Math.round(rl.used_percentage);
  const reset = formatDuration(rl.resets_at);
  let part = ` │ ${rateLimitColor(pct)}${pct}%${RST}`;
  if (reset) part += ` ${MUTED}${icon}${reset}${RST}`;
  return part;
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const ctx = data.context_window || {};
    const model = data.model || {};
    const cwd = data.cwd || '';

    const windowSize = ctx.context_window_size ?? 200000;
    const effectiveWindow = windowSize - AUTOCOMPACT_BUFFER_TOKENS;
    const rawUsedPct = ctx.used_percentage ?? 0;
    const tokensUsed = Math.round((rawUsedPct / 100) * windowSize);
    const usedPct = Math.min(100, Math.round((tokensUsed / effectiveWindow) * 100));
    const level = tokensUsed >= COMPACT_TOKENS ? 'danger' : tokensUsed >= WARN_TOKENS ? 'warn' : 'ok';
    const color = level === 'danger' ? '\x1b[38;5;208m' : level === 'warn' ? '\x1b[33m' : '\x1b[32m';

    const project = cwd ? path.basename(cwd) : '';
    let branch = '';
    if (cwd) {
      try {
        branch = execSync('git --no-optional-locks branch --show-current',
          { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().slice(0, 30);
      } catch { /* not a git repo */ }
    }

    const bar = Array.from({ length: 10 }, (_, i) => {
      const filled = usedPct - i * 10;
      const char = filled >= 8 ? '█' : filled >= 3 ? '▄' : null;
      return char ? `${color}${char}${RST}` : `${DIM}░${RST}`;
    }).join('');

    let lastCallMs;
    try {
      const prev = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      lastCallMs = prev.tokensUsed === tokensUsed ? prev.timestamp : Date.now();
    } catch { lastCallMs = Date.now(); }
    fs.writeFileSync(STATE_FILE, JSON.stringify({ tokensUsed, timestamp: lastCallMs }));
    const last = new Date(lastCallMs);
    const time = `${String(last.getHours()).padStart(2, '0')}:${String(last.getMinutes()).padStart(2, '0')}`;
    const tokensK = (tokensUsed / 1000).toFixed(0);
    const windowK = (effectiveWindow / 1000).toFixed(0);

    let output = `◆ ${(model.display_name ?? 'Claude').replace(/\(1M context\)/, '1M').trim()}`;
    if (project) output += ` │ ▪ ${project}`;
    if (branch) output += ` │ ⎇ ${branch}`;
    output += ` │ ◷ ${time}`;
    output += ` │ ${bar} ${usedPct}% (${tokensK}K/${windowK}K)`;

    const rateLimits = data.rate_limits || {};
    output += formatRateLimit(rateLimits.five_hour, '↻');
    output += formatRateLimit(rateLimits.seven_day, '⟳');

    process.stdout.write(output);
  } catch {
    process.stdout.write('Ctx: --');
  }
});
