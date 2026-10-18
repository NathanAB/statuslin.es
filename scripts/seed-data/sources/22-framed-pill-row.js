#!/usr/bin/env node
/**
 * Claude Code Status Line
 * Truecolor gradient pills · rounded frame · zero dependencies
 *
 * Reads Claude Code's session JSON on stdin and prints a status line to stdout.
 * Config (auto-created on first run): ~/.claude/statusline_config.yml
 * Source & docs: https://github.com/XyzElias/prismatic-claude-statusline
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

// ─── Mini YAML parser (subset — enough for this config) ─────
function parseYaml(text) {
  const lines = text.split("\n");
  const root = {};
  const stack = [{ indent: -1, obj: root, isList: false }];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.replace(/#.*$/m, "").trimEnd();
    if (!stripped.trim()) continue;

    const indent = raw.search(/\S/);
    const content = stripped.trim();

    // Pop stack to matching indent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    // List item
    if (content.startsWith("- ")) {
      const itemStr = content.slice(2).trim();
      if (!Array.isArray(parent.obj)) {
        const prev = stack[stack.length - 1];
        if (!Array.isArray(prev.obj)) continue;
      }
      if (itemStr.includes(":")) {
        const itemObj = {};
        const { key, value } = parseKV(itemStr);
        itemObj[key] = value;
        // Peek ahead for more keys at deeper indent
        let j = i + 1;
        while (j < lines.length) {
          const nRaw = lines[j];
          const nStripped = nRaw.replace(/#.*$/m, "").trimEnd();
          if (!nStripped.trim()) { j++; continue; }
          const nIndent = nRaw.search(/\S/);
          const nContent = nStripped.trim();
          if (nIndent <= indent || nContent.startsWith("- ")) break;
          if (nContent.includes(":")) {
            const kv = parseKV(nContent);
            itemObj[kv.key] = kv.value;
          }
          j++;
        }
        i = j - 1;
        parent.obj.push(itemObj);
      } else {
        parent.obj.push(parseValue(itemStr));
      }
      continue;
    }

    // Key: value
    if (content.includes(":")) {
      const { key, value } = parseKV(content);
      if (value === null) {
        // Peek: is the next line a list item or a nested map?
        let nextI = i + 1;
        while (nextI < lines.length && !lines[nextI].replace(/#.*$/m, "").trim()) nextI++;
        if (nextI < lines.length) {
          const nextLine = lines[nextI].replace(/#.*$/m, "").trim();
          if (nextLine.startsWith("- ")) {
            const arr = [];
            parent.obj[key] = arr;
            stack.push({ indent, obj: arr, isList: true });
          } else {
            const child = {};
            parent.obj[key] = child;
            stack.push({ indent, obj: child, isList: false });
          }
        } else {
          parent.obj[key] = "";
        }
      } else {
        parent.obj[key] = value;
      }
    }
  }
  return root;
}

function parseKV(str) {
  const idx = str.indexOf(":");
  const key = str.slice(0, idx).trim();
  const rest = str.slice(idx + 1).trim();
  if (!rest) return { key, value: null };
  return { key, value: parseValue(rest) };
}

function parseValue(s) {
  if (!s) return "";
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
    return s.slice(1, -1);
  // Flow array: [1, 2, 3] or [[1,2],[3,4]]
  if (s.startsWith("[")) {
    try { return JSON.parse(s); } catch {}
    try { return JSON.parse(s.replace(/([a-zA-Z_]\w*)/g, '"$1"')); } catch {}
    return s;
  }
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  const n = Number(s);
  if (!isNaN(n) && s !== "") return n;
  return s;
}

// ─── Config ─────────────────────────────────────────────────
const HOME = os.homedir();
const CFG_PATH = path.join(HOME, ".claude", "statusline_config.yml");
const DEFAULT_CFG = `# Claude Code Status Line — Configuration
#
# Pill style: nerd | unicode | ascii
#   nerd    — Powerline glyphs for rounded pill caps (requires a Nerd Font)
#   unicode — Unicode block characters (works in any modern terminal)
#   ascii   — Plain [brackets] (maximum compatibility)
# See docs/nerd-fonts.md if you want the rounded "nerd" caps.

style: unicode

show_labels: true

pills:
  model:
    enabled: true
    label: MODEL
    order: 1

  # Reasoning effort of the current session. Auto-hides when the model does not
  # support the effort parameter. Colored per level (colors.effort_levels).
  effort:
    enabled: true
    label: EFFORT
    order: 2

  path:
    enabled: true
    label: PATH
    order: 3

  # Current Git branch of the working directory. Auto-hides when the directory
  # is not inside a Git repository.
  branch:
    enabled: true
    label: BRANCH
    order: 4

  context:
    enabled: true
    label: CONTEXT
    order: 5
    bar_width: 10

  # Subscription usage (Claude Pro/Max). Auto-hides on API/pay-per-use plans,
  # which do not receive rate-limit data from Claude Code.
  rate:
    enabled: true
    label: USAGE
    order: 6
    bar_width: 10
    show_seven_day: false   # also show the 7-day window next to the 5-hour one

  diff:
    enabled: true
    label: DIFF
    order: 7

  # Estimated cost of the CURRENT session (client-side estimate from Claude Code).
  cost:
    enabled: true
    label: COST
    order: 8

  time:
    enabled: true
    label: TIME
    order: 9

colors:
  pill_bg: [58, 62, 72]
  frame: [120, 120, 138]
  label: [120, 120, 138]
  dim: [200, 185, 175]
  path: [120, 200, 255]
  branch: [180, 160, 255]
  time: [130, 210, 255]
  diff_add: [60, 255, 110]
  diff_sep: [70, 95, 90]
  diff_rm: [255, 75, 75]
  cost_grad: [[255, 220, 60], [255, 170, 30]]

  # Two-color gradient per model, matched by model id/name (case-insensitive).
  model_themes:
    opus: [[175, 100, 255], [255, 120, 230]]
    sonnet: [[40, 230, 160], [120, 255, 180]]
    haiku: [[255, 140, 60], [255, 90, 140]]
    fable: [[64, 224, 208], [255, 198, 88]]
    default: [[200, 200, 230], [240, 240, 255]]

  # Per-level effort colors as [[startRGB], [endRGB]]. Repeat the same color
  # for a flat pill, or use two for a gradient.
  effort_levels:
    low:    [[238, 212, 141], [243, 225, 175]]
    medium: [[183, 189, 248], [205, 209, 250]]
    high:   [[120, 171, 244], [120, 171, 244]]
    xhigh:  [[180, 150, 240], [205, 175, 250]]
    max:    [[240, 140, 140], [240, 140, 140]]

  # Progress-bar / percentage colors by fill level (first match wins).
  thresholds:
    - below: 40
      color: [50, 255, 160]
    - below: 65
      color: [200, 255, 50]
    - below: 80
      color: [255, 210, 30]
    - below: 92
      color: [255, 120, 30]
    - below: 999
      color: [255, 50, 50]

frame:
  enabled: true
  top_left: "╭"
  top_right: "╮"
  bot_left: "╰"
  bot_right: "╯"
  horizontal: "─"
  vertical: "│"

# How many trailing directories of the working path to show.
path_segments: 2
`;

// Auto-create the default config on first run.
function ensureConfig() {
  if (!fs.existsSync(CFG_PATH)) {
    try { fs.writeFileSync(CFG_PATH, DEFAULT_CFG, "utf-8"); } catch {}
  }
}

// ─── Config migration ───────────────────────────────────────
// When the script gains a new pill or color, an EXISTING config file is missing
// the corresponding keys. Rather than overwrite the file (which would wipe a
// user's customizations and comments), we surgically insert only the missing
// blocks at the top of their section — every existing line is left untouched.
//
// `MIGRATIONS` lists each addition: the section header to find, the key that
// must exist there, and the YAML block to insert if it doesn't.
const MIGRATIONS = [
  {
    section: "pills",
    key: "branch",
    block:
      "  # Current Git branch of the working directory (added in v1.1).\n" +
      "  # Auto-hides when the directory is not inside a Git repository.\n" +
      "  branch:\n" +
      "    enabled: true\n" +
      "    label: BRANCH\n" +
      "    order: 3\n",
  },
  {
    section: "colors",
    key: "branch",
    block: "  branch: [180, 160, 255]\n",
  },
  {
    section: "pills",
    key: "effort",
    block:
      "  # Reasoning effort of the current session (added in v1.2). Auto-hides\n" +
      "  # when the model does not support the effort parameter. The fractional\n" +
      "  # order slots it between model and path without renumbering your pills.\n" +
      "  effort:\n" +
      "    enabled: true\n" +
      "    label: EFFORT\n" +
      "    order: 1.5\n",
  },
  {
    section: "colors",
    key: "effort_levels",
    block:
      "  # Per-level effort colors (added in v1.2) as [[startRGB], [endRGB]] —\n" +
      "  # repeat the same color for a flat pill, or use two for a gradient.\n" +
      "  effort_levels:\n" +
      "    low:    [[238, 212, 141], [243, 225, 175]]\n" +
      "    medium: [[183, 189, 248], [205, 209, 250]]\n" +
      "    high:   [[120, 171, 244], [120, 171, 244]]\n" +
      "    xhigh:  [[180, 150, 240], [205, 175, 250]]\n" +
      "    max:    [[240, 140, 140], [240, 140, 140]]\n",
  },
];

// Insert `block` as the first child of the top-level `section:` map, but only
// if a child named `key:` is not already present. Returns the (possibly
// unchanged) text. Pure text surgery — existing lines are never modified.
function insertIntoSection(text, section, key, block) {
  const lines = text.split("\n");
  const headerRe = new RegExp("^" + section + ":\\s*$");
  let h = lines.findIndex((l) => headerRe.test(l));
  if (h === -1) return text; // section absent — leave the file alone

  // Walk the section's direct children (indent > 0) until the next top-level key.
  const childKeyRe = new RegExp("^\\s+" + key + ":");
  for (let i = h + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const indent = line.search(/\S/);
    if (indent === 0) break;       // reached the next top-level section
    if (childKeyRe.test(line)) return text; // key already present — nothing to do
  }

  lines.splice(h + 1, 0, block.replace(/\n$/, ""));
  return lines.join("\n");
}

// Bring an existing config file up to date with any new keys the script knows
// about, without disturbing the user's existing settings or comments.
function migrateConfig() {
  let raw;
  try { raw = fs.readFileSync(CFG_PATH, "utf-8"); } catch { return; }
  let next = raw;
  for (const m of MIGRATIONS) {
    next = insertIntoSection(next, m.section, m.key, m.block);
  }
  if (next !== raw) {
    try { fs.writeFileSync(CFG_PATH, next, "utf-8"); } catch {}
  }
}

ensureConfig();
migrateConfig();

let CFG = {};
try {
  CFG = parseYaml(fs.readFileSync(CFG_PATH, "utf-8"));
} catch {
  CFG = {};
}

function cfg(dotPath, defaultVal) {
  let node = CFG;
  for (const key of dotPath.split(".")) {
    if (node && typeof node === "object" && key in node) {
      node = node[key];
    } else {
      return defaultVal;
    }
  }
  return node != null ? node : defaultVal;
}

function col(dotPath, def) {
  const v = cfg(dotPath, def);
  return Array.isArray(v) ? v : def;
}

// ─── Read stdin (JSON from Claude Code) ─────────────────────
let input = "";
process.stdin.setEncoding("utf-8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }
  render(data);
});

// ─── Style presets ──────────────────────────────────────────
const STYLE_PRESETS = {
  nerd:    { left: "", right: "" },
  unicode: { left: "▐", right: "▌" },
  ascii:   { left: "[",      right: "]" },
};

// ─── ANSI helpers ───────────────────────────────────────────
const RST = "\x1b[0m";
const BOLD = "\x1b[1m";
const ANSI_RE = /\x1b\[[^m]*m/g;

function fgC(r, g, b) { return `\x1b[38;2;${r};${g};${b}m`; }
function bgC(r, g, b) { return `\x1b[48;2;${r};${g};${b}m`; }
function stripAnsi(s) { return s.replace(ANSI_RE, ""); }
function visLen(s) { return stripAnsi(s).length; }

function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

function gradient(text, start, end) {
  if (!text) return "";
  const n = Math.max(text.length - 1, 1);
  return [...text].map((ch, i) =>
    fgC(lerp(start[0], end[0], i / n),
        lerp(start[1], end[1], i / n),
        lerp(start[2], end[2], i / n)) + ch
  ).join("");
}

// ─── Git branch (zero-dependency, no subprocess) ────────────
// Walks up from `cwd` to find a Git directory and reads HEAD directly, so it
// adds no latency and works without `git` on PATH. Handles worktrees and
// submodules (where `.git` is a file pointing at the real git dir) and the
// detached-HEAD case (returns a short commit SHA). Returns null when the
// directory is not inside a repository.
function getGitBranch(cwd) {
  if (!cwd) return null;
  try {
    let dir = path.resolve(cwd);
    for (let i = 0; i < 64; i++) {
      const dotGit = path.join(dir, ".git");
      let gitDir = null;
      try {
        const st = fs.statSync(dotGit);
        if (st.isDirectory()) {
          gitDir = dotGit;
        } else if (st.isFile()) {
          // Worktree/submodule: ".git" is a file "gitdir: <path>".
          const m = fs.readFileSync(dotGit, "utf-8").match(/gitdir:\s*(.+)/);
          if (m) gitDir = path.resolve(dir, m[1].trim());
        }
      } catch {}

      if (gitDir) {
        const head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf-8").trim();
        const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
        if (ref) return ref[1];
        // Detached HEAD — show a short commit hash.
        return head.slice(0, 7);
      }

      const parent = path.dirname(dir);
      if (parent === dir) break; // reached filesystem root
      dir = parent;
    }
  } catch {}
  return null;
}

// ─── Render ─────────────────────────────────────────────────
function render(data) {
  const BG_PILL = col("colors.pill_bg", [58, 62, 72]);
  const FRAME_COLOR = fgC(...col("colors.frame", [120, 120, 138]));
  const LABEL_COLOR = fgC(...col("colors.label", [120, 120, 138]));
  const DIM_COLOR = fgC(...col("colors.dim", [200, 185, 175]));

  const style = cfg("style", "unicode");
  const preset = STYLE_PRESETS[style] || STYLE_PRESETS.unicode;
  const PL_LEFT = preset.left;
  const PL_RIGHT = preset.right;

  const thresholds = cfg("colors.thresholds", [
    { below: 40, color: [50, 255, 160] },
    { below: 65, color: [200, 255, 50] },
    { below: 80, color: [255, 210, 30] },
    { below: 92, color: [255, 120, 30] },
    { below: 999, color: [255, 50, 50] },
  ]);

  function thresholdColor(val) {
    for (const t of thresholds) {
      if (val < t.below) return t.color;
    }
    return thresholds[thresholds.length - 1].color;
  }

  const modelThemes = cfg("colors.model_themes", {
    opus: [[175, 100, 255], [255, 120, 230]],
    sonnet: [[40, 230, 160], [120, 255, 180]],
    haiku: [[255, 140, 60], [255, 90, 140]],
    fable: [[64, 224, 208], [255, 198, 88]],
    default: [[200, 200, 230], [240, 240, 255]],
  });

  // ── Data extraction ──────────────────────────────────────
  const modelObj = data.model || {};
  const modelName = modelObj.display_name || "?";
  const modelId = modelObj.id || "";

  const cwd = (data.workspace || {}).current_dir || data.cwd || "";
  const parts = cwd.replace(/\\/g, "/").replace(/\/$/, "").split("/");
  const nSeg = cfg("path_segments", 2);
  const pathStr = parts.length > nSeg
    ? "…/" + parts.slice(-nSeg).join("/")
    : parts.join("/");

  const gitBranch = getGitBranch(cwd);

  // Reasoning effort — present only when the current model supports it. Reflects
  // the live session value (including mid-session /effort changes). "ultra"/
  // ultracode is not a distinct level here; Claude Code reports it as "xhigh".
  const effortLevel = typeof (data.effort || {}).level === "string" ? data.effort.level : null;
  const effortLevels = cfg("colors.effort_levels", {
    low:    [[238, 212, 141], [243, 225, 175]],
    medium: [[183, 189, 248], [205, 209, 250]],
    high:   [[120, 171, 244], [120, 171, 244]],
    xhigh:  [[180, 150, 240], [205, 175, 250]],
    max:    [[240, 140, 140], [240, 140, 140]],
  });

  const ctx = data.context_window || {};
  const pct = Math.min(Math.round(ctx.used_percentage || 0), 100);
  const ctxSize = ctx.context_window_size || 0;
  const ctxFmt = ctxSize >= 1e6
    ? (ctxSize / 1e6).toFixed(1) + "M"
    : ctxSize >= 1000 ? Math.floor(ctxSize / 1000) + "k" : String(ctxSize);

  const costData = data.cost || {};
  const costUsd = costData.total_cost_usd || 0;
  const linesAdd = costData.total_lines_added || 0;
  const linesRm = costData.total_lines_removed || 0;

  const durTotal = Math.floor((costData.total_duration_ms || 0) / 1000);
  const durH = Math.floor(durTotal / 3600);
  const durM = Math.floor((durTotal % 3600) / 60);
  const durS = durTotal % 60;
  const duration = durH
    ? `${durH}h ${String(durM).padStart(2, "0")}m`
    : `${durM}m ${String(durS).padStart(2, "0")}s`;

  // ── Rate limits (Claude Pro/Max only; absent on API plans) ──
  function rateWindow(win) {
    if (!win) return null;
    const wPct = Math.round(win.used_percentage || 0);
    let resetStr = "";
    try {
      if (win.resets_at > 0) {
        const d = new Date(win.resets_at * 1000);
        resetStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    } catch {}
    return { pct: wPct, resetStr };
  }
  const rl = data.rate_limits || {};
  const w5 = rateWindow(rl.five_hour);
  const w7 = rateWindow(rl.seven_day);

  // ── Model theme (matched by id/name substring) ───────────
  const modelKey = (modelId || modelName).toLowerCase();
  let themeGrad = null;
  for (const [k, grad] of Object.entries(modelThemes)) {
    if (k !== "default" && modelKey.includes(k)) {
      themeGrad = [grad[0], grad[1]];
      break;
    }
  }
  if (!themeGrad) {
    const d = modelThemes.default || [[200, 200, 230], [240, 240, 255]];
    themeGrad = [d[0], d[1]];
  }

  // ── Progress bar ─────────────────────────────────────────
  function progressBar(pctVal, width, color) {
    const filled = Math.min(Math.floor(pctVal * width / 100), width);
    const track = BG_PILL.map(v => Math.min(255, v + 55));
    let out = "";
    for (let i = 0; i < width; i++) {
      const t = i / Math.max(width - 1, 1);
      const factors = [0.2, 0.12, 0.08];
      if (i < filled) {
        const cc = color.map((v, j) => Math.min(255, Math.round(v * (1 - t * factors[j]))));
        out += fgC(...cc) + "━";
      } else {
        out += fgC(...track) + "━";
      }
    }
    return out;
  }

  // ── Pill builder ─────────────────────────────────────────
  let pills = "";
  let labels = "";
  let first = true;

  function addPill(content, label) {
    const gap = first ? "" : " ";
    first = false;
    const b = BG_PILL;
    const pillStr = fgC(...b) + PL_LEFT + bgC(...b) + " "
      + content + RST + bgC(...b) + " " + RST + fgC(...b) + PL_RIGHT;
    pills += gap + pillStr;
    const pillW = visLen(pillStr);
    const centered = label ? label.padStart(Math.ceil((pillW + label.length) / 2)).padEnd(pillW) : " ".repeat(pillW);
    labels += gap + LABEL_COLOR + centered + RST;
  }

  function pillCfg(name) {
    const p = cfg(`pills.${name}`, { enabled: true, label: name.toUpperCase() });
    return (p && p.enabled !== false) ? p : null;
  }

  // ── Build segments ───────────────────────────────────────
  const segments = [];

  { // Model
    const p = pillCfg("model");
    if (p) segments.push({ order: p.order || 1, build: () => {
      addPill(BOLD + gradient(modelName, themeGrad[0], themeGrad[1]) + RST + bgC(...BG_PILL), p.label || "MODEL");
    }});
  }

  { // Reasoning effort (only when the model reports it)
    const p = pillCfg("effort");
    if (p && effortLevel) {
      const stops = effortLevels[effortLevel] || effortLevels.high || [[200, 200, 230], [240, 240, 255]];
      segments.push({ order: p.order || 2, build: () => {
        addPill(BOLD + gradient(effortLevel, stops[0], stops[1] || stops[0]) + RST + bgC(...BG_PILL), p.label || "EFFORT");
      }});
    }
  }

  { // Path
    const p = pillCfg("path");
    if (p) segments.push({ order: p.order || 2, build: () => {
      addPill(BOLD + fgC(...col("colors.path", [120, 200, 255])) + pathStr + RST + bgC(...BG_PILL), p.label || "PATH");
    }});
  }

  { // Git branch (only inside a repository)
    const p = pillCfg("branch");
    if (p && gitBranch) {
      segments.push({ order: p.order || 3, build: () => {
        addPill(BOLD + fgC(...col("colors.branch", [180, 160, 255])) + gitBranch + RST + bgC(...BG_PILL), p.label || "BRANCH");
      }});
    }
  }

  { // Context window
    const p = pillCfg("context");
    if (p) {
      const bw = p.bar_width || 10;
      const ctxClr = thresholdColor(pct);
      segments.push({ order: p.order || 4, build: () => {
        addPill(
          fgC(...ctxClr) + BOLD + `${pct}%` + RST + bgC(...BG_PILL)
          + DIM_COLOR + ` / ${ctxFmt}  `
          + progressBar(pct, bw, ctxClr) + RST + bgC(...BG_PILL),
          p.label || "CONTEXT"
        );
      }});
    }
  }

  { // Subscription usage (rate limits) — only when Claude Code provides them
    const p = pillCfg("rate");
    const showSeven = p && p.show_seven_day === true;
    if (p && (w5 || (showSeven && w7))) {
      const bw = p.bar_width || 10;
      segments.push({ order: p.order || 5, build: () => {
        let content = "";
        if (w5) {
          const c = thresholdColor(w5.pct);
          content += fgC(...c) + BOLD + `${w5.pct}%` + RST + bgC(...BG_PILL)
            + "  " + progressBar(w5.pct, bw, c) + RST + bgC(...BG_PILL)
            + (w5.resetStr ? DIM_COLOR + `  ${w5.resetStr}` : "");
        }
        if (showSeven && w7) {
          const c = thresholdColor(w7.pct);
          content += (w5 ? DIM_COLOR + "  ·  " : "")
            + fgC(...c) + BOLD + `7d ${w7.pct}%` + RST + bgC(...BG_PILL);
        }
        addPill(content, p.label || "USAGE");
      }});
    }
  }

  { // Diff
    const p = pillCfg("diff");
    if (p && (linesAdd > 0 || linesRm > 0)) {
      segments.push({ order: p.order || 6, build: () => {
        addPill(
          fgC(...col("colors.diff_add", [60, 255, 110])) + BOLD + `+${linesAdd}` + RST + bgC(...BG_PILL)
          + fgC(...col("colors.diff_sep", [70, 95, 90])) + "  "
          + fgC(...col("colors.diff_rm", [255, 75, 75])) + BOLD + `−${linesRm}` + RST + bgC(...BG_PILL),
          p.label || "DIFF"
        );
      }});
    }
  }

  { // Session cost
    const p = pillCfg("cost");
    if (p) {
      const cg = cfg("colors.cost_grad", [[255, 220, 60], [255, 170, 30]]);
      segments.push({ order: p.order || 7, build: () => {
        addPill(
          BOLD + gradient(`$${costUsd.toFixed(2)}`, cg[0], cg[1]) + RST + bgC(...BG_PILL),
          p.label || "COST"
        );
      }});
    }
  }

  { // Session duration
    const p = pillCfg("time");
    if (p) segments.push({ order: p.order || 8, build: () => {
      addPill(BOLD + fgC(...col("colors.time", [130, 210, 255])) + duration + RST + bgC(...BG_PILL), p.label || "TIME");
    }});
  }

  // ── Render (sorted by order) ─────────────────────────────
  segments.sort((a, b) => a.order - b.order);
  for (const seg of segments) seg.build();

  // ── Frame & output ───────────────────────────────────────
  const showLabels = cfg("show_labels", true);
  const w = visLen(pills);

  const fr = cfg("frame", {});
  if (fr.enabled !== false) {
    const h = fr.horizontal || "─";
    const v = fr.vertical || "│";
    const top = FRAME_COLOR + (fr.top_left || "╭") + h.repeat(w + 2) + (fr.top_right || "╮") + RST;
    const bot = FRAME_COLOR + (fr.bot_left || "╰") + h.repeat(w + 2) + (fr.bot_right || "╯") + RST;
    const row = FRAME_COLOR + v + RST + " " + pills + " " + FRAME_COLOR + v + RST;
    process.stdout.write("​\n");
    process.stdout.write(top + "\n");
    process.stdout.write(row + "\n");
    if (showLabels) {
      process.stdout.write(FRAME_COLOR + v + RST + " " + labels + " " + FRAME_COLOR + v + RST + "\n");
    }
    process.stdout.write(bot + "\n");
    process.stdout.write("​\n");
  } else {
    process.stdout.write("​\n");
    process.stdout.write(pills + "\n");
    if (showLabels) {
      process.stdout.write(labels + "\n");
    }
    process.stdout.write("​\n");
  }
}
