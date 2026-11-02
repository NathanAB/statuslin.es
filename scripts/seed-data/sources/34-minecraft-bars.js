#!/usr/bin/env node
// minecraft-statusline — a Minecraft-themed statusline for Claude Code
// https://github.com/jonahmabry/minecraft-statusline
//
// Line 1: model (tinted by "material" — netherite/diamond/gold/iron), dir, git branch, cost, elapsed time, cache tokens
// Line 2: hearts = 5-hour rate limit (depletes as usage climbs), food = 7-day rate limit
// Line 3: XP bar = context window fill percentage
//
// Pure Node — no external dependencies. git is optional (used only for the branch segment).

const { execSync } = require("child_process");

const NETHERITE = "\x1b[0;90m";
const DIAMOND = "\x1b[96m";
const GOLD = "\x1b[1;33m";
const IRON = "\x1b[38;5;251m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const RESET = "\x1b[0m";

// ---------- helpers ----------
// Integer part of a possibly-decimal value ("42.5" -> 42), mirroring bash ${x%.*}.
function intPart(v) {
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? 0 : n;
}

function formatCountdown(resetsAt) {
  const now = Math.floor(Date.now() / 1000);
  const diff = Number(resetsAt) - now;
  if (diff <= 0) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h${Math.floor((diff % 3600) / 60)}m`;
  return `${Math.floor(diff / 86400)}d${Math.floor((diff % 86400) / 3600)}h`;
}

// 10-icon bar that DEPLETES as usage climbs.
function renderMcBar(used, full, empty) {
  let remaining = 100 - intPart(used);
  if (remaining < 0) remaining = 0;
  if (remaining > 100) remaining = 100;
  let filled = Math.floor((remaining + 5) / 10);
  if (filled > 10) filled = 10;
  if (filled === 0 && remaining > 0) filled = 1;
  const empties = 10 - filled;
  return full.repeat(filled) + empty.repeat(empties);
}

// N-segment bar that FILLS as usage climbs.
function renderFillBar(pct, full, empty, segs) {
  let filled = Math.floor((pct * segs) / 100);
  if (filled > segs) filled = segs;
  const empties = segs - filled;
  return full.repeat(filled) + empty.repeat(empties);
}

function fmtTokens(n) {
  n = Number(n) || 0;
  return n >= 1000 ? `${Math.floor(n / 1000)}k` : `${n}`;
}

// Present = value provided and non-empty, mirroring bash `// empty` + [ -n ] (0 counts as present).
function present(v) {
  return v !== undefined && v !== null && v !== "";
}

function gitBranch(dir) {
  if (!dir) return "";
  const run = (cmd) => execSync(cmd, { cwd: dir, stdio: ["ignore", "pipe", "ignore"] }).toString();
  try {
    run("git rev-parse --git-dir");
  } catch {
    return "";
  }
  let branchName = "";
  try {
    branchName = run("git branch --show-current").trim();
  } catch {
    /* detached HEAD or no commits — leave blank */
  }
  let dirty = "";
  try {
    const lines = run("git status --porcelain").split("\n").filter((l) => l.length > 0);
    if (lines.length > 0) {
      // A staged/changed index char (not space, not ?) means dirty "*"; otherwise "!".
      dirty = lines.some((l) => l[0] !== " " && l[0] !== "?") ? "*" : "!";
    }
  } catch {
    /* ignore */
  }
  return ` | 🌿 ${branchName}${dirty}`;
}

function render(input) {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    return; // no/!invalid input — print nothing rather than a broken line
  }

  const model = data?.model?.display_name ?? "";
  const dir = data?.workspace?.current_dir ?? "";
  const cost = Number(data?.cost?.total_cost_usd ?? 0);
  const pct = intPart(data?.context_window?.used_percentage ?? 0);
  const durationMs = Number(data?.cost?.total_duration_ms ?? 0);
  const cacheRead = Number(data?.cost?.cache_read_input_tokens ?? 0);
  const cacheWrite = Number(data?.cost?.cache_creation_input_tokens ?? 0);

  // ---------- model color (tints the model name in the header) ----------
  const modelLc = model.toLowerCase();
  let modelColor = IRON;
  if (modelLc.includes("fable")) modelColor = NETHERITE;
  else if (modelLc.includes("opus")) modelColor = DIAMOND;
  else if (modelLc.includes("sonnet")) modelColor = GOLD;
  else if (modelLc.includes("haiku")) modelColor = IRON;

  // ---------- XP bar = context window (fills up as the window fills) ----------
  const xpBar = renderFillBar(pct, "🟩", "⬛", 26);

  // ---------- elapsed time ----------
  const mins = Math.floor(durationMs / 60000);
  const secs = Math.floor((durationMs % 60000) / 1000);
  const timeFmt = `⏱️ ${mins}m ${secs}s`;

  // ---------- git branch ----------
  const branch = gitBranch(dir);

  // ---------- rate limits: hearts = 5h, food = 7d ----------
  const fivePct = data?.rate_limits?.five_hour?.used_percentage;
  const fiveResets = data?.rate_limits?.five_hour?.resets_at;
  const weekPct = data?.rate_limits?.seven_day?.used_percentage;
  const weekResets = data?.rate_limits?.seven_day?.resets_at;

  let healthSeg = "";
  if (present(fivePct)) {
    healthSeg = `${renderMcBar(fivePct, "❤️", "🖤")} ${intPart(fivePct)}%`;
    if (present(fiveResets)) healthSeg += ` ${MAGENTA}${formatCountdown(fiveResets)}${RESET}`;
  }
  let foodSeg = "";
  if (present(weekPct)) {
    foodSeg = `${renderMcBar(weekPct, "🍗", "🦴")} ${intPart(weekPct)}%`;
    if (present(weekResets)) foodSeg += ` ${MAGENTA}${formatCountdown(weekResets)}${RESET}`;
  }

  // ---------- cost + cache ----------
  const costFmt = `$${cost.toFixed(2)}`;
  let cacheSegment = "";
  if (cacheRead > 0 || cacheWrite > 0) {
    cacheSegment = ` | ${CYAN}↩${fmtTokens(cacheRead)} ↪${fmtTokens(cacheWrite)}${RESET}`;
  }

  // ---------- render the HUD ----------
  const dirBase = String(dir).split(/[/\\]/).pop();
  const line1 = `${modelColor}[${model}]${RESET} 📁 ${dirBase}${branch} | ${GOLD}${costFmt}${RESET} | ${timeFmt}${cacheSegment}`;
  const line2 = `${healthSeg}   ${foodSeg}`;
  const line3 = `${xpBar} ${pct}%`;
  process.stdout.write(`${line1}\n${line2}\n${line3}\n`);
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => render(input));
