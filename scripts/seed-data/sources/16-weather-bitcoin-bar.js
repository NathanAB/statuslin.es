#!/usr/bin/env node

/**
 * Enhanced Claude Code Status Line - Real Token Tracking Edition
 * Professional status line with weather, git info, Bitcoin price, Claude Code version, and REAL token usage
 *
 * Features:
 * - Real token usage from Claude Code transcript files (input_tokens + cache_creation_input_tokens + cache_read_input_tokens)
 * - Weather integration with 30-minute caching
 * - Bitcoin price tracking with 15-minute caching
 * - Git branch and status display
 * - Context window progress bar with actual token counts
 * - Visual indicator: ● (bright green) = real data, ~ (dimmed yellow) = estimated data
 * - Updates dynamically after each message with accurate percentages
 *
 * Configure your zip code/location in the weather section below
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const os = require('os');
// bplist-parser no longer needed - using direct API fetch for all usage data

// ANSI color codes for terminal styling
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    orange: '\x1b[38;5;208m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m'
};

// ========================================
// CONFIGURATION SECTION - CUSTOMIZE HERE
// ========================================

// Weather Configuration - Change to your location!
const WEATHER_CONFIG = {
    zipCode: '90001',              // Your zip code (e.g., '90001' for Los Angeles)
    cityName: 'Los Angeles,CA',    // Your city and state (e.g., 'New York,NY')
    latitude: 34.0522,             // Your latitude (optional, for fallback)
    longitude: -118.2437,          // Your longitude (optional, for fallback)
    defaultLocation: 'Los Angeles',// Display name when location unknown
    celsius: false                 // Set true for °C, false for °F
};

// Merge local config overrides (config.local.json in same dir — git-ignored, never committed)
try {
    const localCfgPath = path.join(__dirname, 'config.local.json');
    if (fs.existsSync(localCfgPath)) {
        Object.assign(WEATHER_CONFIG, JSON.parse(fs.readFileSync(localCfgPath, 'utf8')));
    }
} catch (e) { /* ignore parse errors */ }

// Claude Usage API Configuration (cross-platform)
const USAGE_API_CONFIG = {
    credentialsPath: path.join(os.homedir(), '.claude', 'usage-credentials.json'),
    cacheDuration: 10 * 60 * 1000,  // 10 minutes (reduces rate limiting)
    apiBaseUrl: 'claude.ai'
};

// Unified usage cache (replaces separate plist and five-hour caches)
const USAGE_API_CACHE_FILE = path.join(os.tmpdir(), 'claude-statusline-api-usage.json');
const USAGE_API_CACHE_DURATION = USAGE_API_CONFIG.cacheDuration;

// Backoff state file — shared across all sessions to avoid hammering a rate-limited API
const USAGE_API_BACKOFF_FILE = path.join(os.tmpdir(), 'claude-statusline-api-backoff.json');
const BACKOFF_BASE_MS = USAGE_API_CONFIG.cacheDuration; // starts at cache TTL (10m)
const BACKOFF_MAX_MS = 60 * 60 * 1000; // cap at 60 minutes

// ========================================
// END CONFIGURATION SECTION
// ========================================

// Function to create a progress bar for context window
function createProgressBar(percentage, width = 20) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    let color = colors.green;
    if (percentage > 70) color = colors.yellow;
    if (percentage > 85) color = colors.red;

    return `${color}${bar}${colors.reset} ${percentage.toFixed(1)}%`;
}

// Token estimation based on model type
const TOKEN_LIMITS = {
    'claude-haiku-4-5': 200000,
    'claude-sonnet-4-6': 1000000,
    'claude-sonnet-4-5': 1000000,
    'claude-sonnet-4': 1000000,
    'claude-opus-4-8': 200000,
    'claude-opus-4-7': 200000,
    'claude-opus-4-5': 200000,
    'claude-opus-4-1': 200000,
    'claude-opus-4': 200000,
    'opus': 200000,
    'claude-3-opus': 200000,
    'claude-3-sonnet': 200000,
    'claude-3-haiku': 200000,
    'claude-2.1': 200000,
    'claude-2': 100000,
    'claude-instant': 100000,
    'default': 200000
};

// Map a model id to a friendly display name. The id is authoritative — Claude
// Code sometimes passes a stale `display_name` (e.g. shows "Opus 4.7" right after
// switching to 4.8), so we derive from the id first and only fall back to the
// provided display_name / a generic label when the id is unrecognized.
function modelDisplayName(modelId, providedDisplayName) {
    const id = (modelId || '').toLowerCase();
    // Ordered longest-match-first so 'claude-opus-4-8' wins over 'claude-opus-4'.
    const MAP = [
        ['claude-opus-4-8', 'Opus 4.8'],
        ['claude-opus-4-7', 'Opus 4.7'],
        ['claude-opus-4-5', 'Opus 4.5'],
        ['claude-opus-4-1', 'Opus 4.1'],
        ['claude-opus-4',   'Opus 4'],
        ['claude-sonnet-4-6', 'Sonnet 4.6'],
        ['claude-sonnet-4-5', 'Sonnet 4.5'],
        ['claude-sonnet-4',   'Sonnet 4'],
        ['claude-haiku-4-5',  'Haiku 4.5'],
        ['claude-3-opus',     'Opus 3'],
        ['claude-3-sonnet',   'Sonnet 3'],
        ['claude-3-haiku',    'Haiku 3'],
    ];
    for (const [key, name] of MAP) {
        if (id.includes(key)) return name;
    }
    // Unknown id: strip any "(1M context)" suffix from the provided name and use it.
    if (providedDisplayName) {
        return providedDisplayName
            .replace(/\s*[\(\[\-]\s*1\s*m(\s+context)?\s*[\)\]]?\s*$/i, '')
            .replace(/\s+1m\s+context\s*$/i, '')
            .trim();
    }
    return 'Claude';
}

// Resolve the transcript path robustly, EVERYWHERE by default. The harness may pass
// a transcript_path that doesn't resolve as-given on Windows: backslash escaping, or
// the C:\ <-> F:\ junction (projects live at F:\claude\... but Claude may key the
// project dir under either drive letter). When that happens the context counter falls
// back to the fake '~ 1% [--/200K]' estimate. This resolver makes the real counter work
// regardless of drive/junction/naming.
//
// Strategy:
//  1. Use transcript_path as-given if it exists.
//  2. Try slash-normalized and every drive-letter variant of it.
//  3. Fall back to scanning ~/.claude/projects: find the encoded dir for cwd across all
//     drive letters; if none, match any project dir whose name ENDS WITH the project's
//     basename. Pick the dir holding the most-recently-modified *.jsonl.
function resolveTranscriptPath(data) {
    const DRIVES = ['C', 'F', 'D', 'E', 'G'];
    const projectsRoot = path.join(os.homedir(), '.claude', 'projects');
    const tp = data.transcript_path;

    // ---- 1 & 2: the given path, normalized, and across drive letters ----
    if (tp) {
        const fwd = tp.replace(/\\/g, '/');
        const variants = new Set([tp, fwd]);
        variants.add(fwd.replace(/^([A-Za-z]):/, (m, d) => d.toUpperCase() + ':'));
        for (const D of DRIVES) variants.add(fwd.replace(/^[A-Za-z]:/, D + ':'));
        for (const p of variants) {
            try { if (p && fs.existsSync(p)) return p; } catch {}
        }
    }

    // ---- 3: scan project dirs ----
    try {
        const cwd = (data.workspace && data.workspace.current_dir) || data.cwd || process.cwd();
        if (!fs.existsSync(projectsRoot)) return tp;
        const allDirs = fs.readdirSync(projectsRoot)
            .filter(d => { try { return fs.statSync(path.join(projectsRoot, d)).isDirectory(); } catch { return false; } });

        // Claude encodes the project dir name by replacing each : \ / . with '-'
        // (consecutive dashes preserved): F:\claude\selfie-gen -> F--claude-selfie-gen
        const encoded = cwd.replace(/[:\\/.]/g, '-');
        const encodedNoDrive = encoded.replace(/^[A-Za-z]-/, '');   // -claude-selfie-gen
        const basename = path.basename(cwd.replace(/\\/g, '/'));     // selfie-gen

        // Candidate dir names, best-match first.
        const exact = new Set([encoded]);
        for (const D of DRIVES) exact.add(D + '-' + encodedNoDrive);

        const pickNewestJsonl = (dirName) => {
            const dir = path.join(projectsRoot, dirName);
            let js;
            try { js = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')); } catch { return null; }
            if (!js.length) return null;
            const best = js
                .map(f => ({ p: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtimeMs }))
                .sort((a, b) => b.m - a.m)[0];
            return best ? best.p : null;
        };

        // a) exact encoded match (any drive letter)
        for (const name of exact) {
            if (allDirs.includes(name)) { const hit = pickNewestJsonl(name); if (hit) return hit; }
        }
        // b) any project dir ending with the encoded-no-drive tail (handles odd drive prefixes)
        const tailMatches = allDirs.filter(d => d.endsWith(encodedNoDrive) && encodedNoDrive.length > 3);
        // c) else any project dir ending with the basename (loosest, still scoped to this project)
        const baseMatches = allDirs.filter(d => d.endsWith('-' + basename) || d.endsWith(basename));
        const ranked = [...tailMatches, ...baseMatches.filter(d => !tailMatches.includes(d))];
        let bestPath = null, bestMtime = -1;
        for (const name of ranked) {
            const hit = pickNewestJsonl(name);
            if (hit) {
                const m = fs.statSync(hit).mtimeMs;
                if (m > bestMtime) { bestMtime = m; bestPath = hit; }
            }
        }
        if (bestPath) return bestPath;
    } catch {}

    return tp; // graceful fallback (existsSync fails -> '~' estimate, as before)
}

// Function to read actual token usage from Claude Code transcript
function getActualTokenUsage(data) {
    // Get model-specific token limit
    const modelId = data.model?.id || 'opus';
    const modelName = modelId.toLowerCase();
    let tokenLimit = TOKEN_LIMITS.default;

    for (const [key, limit] of Object.entries(TOKEN_LIMITS)) {
        if (modelName.includes(key)) {
            tokenLimit = limit;
            break;
        }
    }

    // 1M context variant detection: model IDs like 'claude-opus-4-7[1m]' or '...-1m'
    const is1M = /\[1m\]/i.test(modelId) || /[-_]1m\b/i.test(modelId);
    if (is1M) tokenLimit = 1000000;

    // Try to read the transcript file to get actual token usage
    const transcriptPath = resolveTranscriptPath(data);
    if (transcriptPath && fs.existsSync(transcriptPath)) {
        try {
            const transcriptData = fs.readFileSync(transcriptPath, 'utf8');
            const lines = transcriptData.split('\n').filter(line => line.trim());

            let mostRecentUsage = null;
            let messageCount = 0;

            // Parse each message in the transcript to find the most recent assistant response with usage data
            for (const line of lines) {
                try {
                    const message = JSON.parse(line);

                    // Look for assistant messages with usage data
                    if (message.type === 'assistant' && message.message && message.message.usage) {
                        messageCount++;
                        mostRecentUsage = message.message.usage;
                    }
                } catch (parseError) {
                    // Skip invalid JSON lines
                    continue;
                }
            }

            // If we found actual usage data, calculate real context usage
            if (mostRecentUsage) {
                // Calculate total context usage with overhead multiplier (from L3's accurate formula)
                // Total = (input_tokens + cache_creation + cache_read + output_tokens) * 1.2
                // 1.2x accounts for MCP tool schemas (~40K), system prompts, plugin configs
                const inputTokens = mostRecentUsage.input_tokens || 0;
                const cacheCreationTokens = mostRecentUsage.cache_creation_input_tokens || 0;
                const cacheReadTokens = mostRecentUsage.cache_read_input_tokens || 0;
                const outputTokens = mostRecentUsage.output_tokens || 0;

                const OVERHEAD_MULTIPLIER = 1.2;
                const rawContextUsed = inputTokens + cacheCreationTokens + cacheReadTokens + outputTokens;
                const contextUsed = Math.round(rawContextUsed * OVERHEAD_MULTIPLIER);
                const percentage = (contextUsed / tokenLimit) * 100;

                // Debug logging if enabled
                if (process.env.DEBUG_STATUSLINE) {
                    console.error(`[DEBUG] REAL Token Usage:
                      Input tokens: ${inputTokens}
                      Cache creation tokens: ${cacheCreationTokens}
                      Cache read tokens: ${cacheReadTokens}
                      Output tokens: ${outputTokens}
                      Raw context: ${rawContextUsed}
                      With overhead (1.2x): ${contextUsed}
                      Token limit: ${tokenLimit}
                      Percentage: ${percentage.toFixed(2)}%
                      Messages: ${messageCount}`);
                }

                return {
                    percentage: percentage,
                    used: contextUsed,
                    limit: tokenLimit,
                    is1M: is1M,
                    isActual: true,
                    debug: {
                        inputTokens,
                        cacheCreationTokens,
                        cacheReadTokens,
                        outputTokens,
                        rawContext: rawContextUsed,
                        messageCount,
                        totalContext: contextUsed
                    }
                };
            }

        } catch (error) {
            // Fall back to estimation if transcript reading fails
            console.error('Error reading transcript for token usage:', error.message);
        }
    }

    // Fallback to estimation if transcript not available
    return estimateContextUsageFallback(data, tokenLimit, is1M);
}

// Fallback estimation function (simplified version of old function)
function estimateContextUsageFallback(data, tokenLimit, is1M = false) {
    const sessionId = data.session_id || '';

    // More realistic estimation for new conversations
    // Most conversations start small and grow gradually
    const sessionHash = sessionId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

    // Start with a small base (1-5% for new conversations)
    const basePercentage = 1 + (sessionHash % 4); // 1-5% base

    // Add modest growth based on session characteristics
    const sessionLength = sessionId.length;
    const lengthBoost = Math.min(10, sessionLength * 0.2); // Up to 10% based on session ID length

    let percentage = basePercentage + lengthBoost;

    // Clamp to realistic range for most conversations
    percentage = Math.max(0.5, Math.min(25, percentage)); // 0.5% to 25% range

    // Convert percentage to actual token count
    const estimatedUsed = Math.floor((percentage / 100) * tokenLimit);

    // Ensure minimum realistic token usage (at least 1K for any active conversation)
    const minimumUsed = Math.max(estimatedUsed, 1000);
    const finalPercentage = (minimumUsed / tokenLimit) * 100;

    return {
        percentage: finalPercentage,
        used: minimumUsed,
        limit: tokenLimit,
        is1M: is1M,
        isActual: false
    };
}

// ============================================================================
// API COST CALCULATION (direct API billing — independent of plan quotas)
// ============================================================================

// Per-million-token rates in USD. Anthropic standard pricing as of May 2026.
// 1M-context Opus 4.7 uses 2x rates (premium tier). Cache write = same as input,
// cache read = 10% of input. Override any value via CLAUDE_PRICING env JSON.
const PRICING = {
    // model id pattern -> { input, output, cacheWriteMul, cacheReadMul }
    'claude-opus-4-8':   { input: 15.00, output: 75.00, ctxPremiumMul: 2.0 },
    'claude-opus-4-7':   { input: 15.00, output: 75.00, ctxPremiumMul: 2.0 },
    'claude-opus-4-5':   { input: 15.00, output: 75.00, ctxPremiumMul: 2.0 },
    'claude-opus-4-1':   { input: 15.00, output: 75.00, ctxPremiumMul: 2.0 },
    'claude-opus-4':     { input: 15.00, output: 75.00, ctxPremiumMul: 2.0 },
    'claude-sonnet-4-6': { input:  3.00, output: 15.00, ctxPremiumMul: 2.0 }, // >200K tier
    'claude-sonnet-4-5': { input:  3.00, output: 15.00, ctxPremiumMul: 2.0 },
    'claude-sonnet-4':   { input:  3.00, output: 15.00, ctxPremiumMul: 2.0 },
    'claude-haiku-4-5':  { input:  1.00, output:  5.00, ctxPremiumMul: 1.0 },
    'opus':              { input: 15.00, output: 75.00, ctxPremiumMul: 1.0 },
    'claude-3-opus':     { input: 15.00, output: 75.00, ctxPremiumMul: 1.0 },
    'claude-3-sonnet':   { input:  3.00, output: 15.00, ctxPremiumMul: 1.0 },
    'claude-3-haiku':    { input:  0.25, output:  1.25, ctxPremiumMul: 1.0 },
    'default':           { input:  3.00, output: 15.00, ctxPremiumMul: 1.0 }
};

const CACHE_WRITE_MULTIPLIER = 1.25; // cache_creation costs 1.25x input
const CACHE_READ_MULTIPLIER   = 0.10; // cache_read costs 0.10x input

function getPricing(modelId) {
    const id = (modelId || '').toLowerCase();
    // Apply env override if set
    try {
        if (process.env.CLAUDE_PRICING) {
            const override = JSON.parse(process.env.CLAUDE_PRICING);
            for (const key of Object.keys(override)) {
                if (id.includes(key.toLowerCase())) return override[key];
            }
        }
    } catch (_) {}
    for (const key of Object.keys(PRICING)) {
        if (key !== 'default' && id.includes(key)) return PRICING[key];
    }
    return PRICING.default;
}

// ============================================================================
// SESSION METADATA (start time, model switches, todos, MCP count)
// ============================================================================

function getSessionMeta(data) {
    const result = { sessionStart: null, elapsedStr: null, modelSwitched: false, uniqueModels: [] };
    const transcriptPath = data.transcript_path;
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return result;
    try {
        const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
        const models = new Set();
        for (const line of lines) {
            try {
                const msg = JSON.parse(line);
                if (!result.sessionStart && msg.timestamp && msg.type === 'user') {
                    result.sessionStart = new Date(msg.timestamp);
                }
                if (msg.type === 'assistant' && msg.message?.model && msg.message.model !== '<synthetic>') {
                    models.add(msg.message.model);
                }
            } catch (_) {}
        }
        result.uniqueModels = [...models];
        result.modelSwitched = models.size > 1;
        if (result.sessionStart) {
            const elapsedMs = Date.now() - result.sessionStart.getTime();
            const mins = Math.floor(elapsedMs / 60000);
            const hours = Math.floor(mins / 60);
            result.elapsedStr = hours > 0 ? `${hours}h${mins % 60}m` : `${mins}m`;
        }
    } catch (_) {}
    return result;
}

function getSessionTodos(sessionId) {
    if (!sessionId) return null;
    const taskDir = path.join(os.homedir(), '.claude', 'tasks', sessionId);
    if (!fs.existsSync(taskDir)) return null;
    try {
        const files = fs.readdirSync(taskDir).filter(f => f.endsWith('.json') && f !== '.highwatermark');
        let pending = 0, inProgress = 0, total = 0;
        for (const f of files) {
            try {
                const task = JSON.parse(fs.readFileSync(path.join(taskDir, f), 'utf8'));
                if (task.status === 'deleted') continue;
                total++;
                if (task.status === 'pending') pending++;
                else if (task.status === 'in_progress') inProgress++;
            } catch (_) {}
        }
        if (total === 0) return null;
        const open = pending + inProgress;
        const done = total - open;
        return { open, done, total, inProgress };
    } catch (_) { return null; }
}

function getMcpCount() {
    let count = 0;
    try {
        const local = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.local.json'), 'utf8'));
        if (Array.isArray(local.enabledMcpjsonServers)) count += local.enabledMcpjsonServers.length;
    } catch (_) {}
    try {
        const mcpJson = path.join(os.homedir(), '.mcp.json');
        if (fs.existsSync(mcpJson)) {
            const mcp = JSON.parse(fs.readFileSync(mcpJson, 'utf8'));
            count += Object.keys(mcp.mcpServers || {}).length;
        }
    } catch (_) {}
    return count > 0 ? count : null;
}

// Sum cost across the entire session transcript. Handles model-switching mid-session.
// Tier-aware: when an assistant message used the 1M variant, applies ctxPremiumMul.
function calculateSessionCost(data) {
    const transcriptPath = data.transcript_path;
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
        return { total: 0, byModel: {}, isActual: false };
    }
    try {
        const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
        const byModel = {};
        let total = 0;
        for (const line of lines) {
            try {
                const msg = JSON.parse(line);
                if (msg.type !== 'assistant' || !msg.message?.usage) continue;
                const modelId = msg.message.model || data.model?.id || 'default';
                if (modelId === '<synthetic>') continue; // skip Claude Code system msgs
                const u = msg.message.usage;
                const p = getPricing(modelId);
                // Detect tier: 1M variant or context >200K triggers premium pricing
                const is1M = /\[1m\]/i.test(modelId) || /[-_]1m\b/i.test(modelId);
                const totalCtx = (u.input_tokens||0) + (u.cache_creation_input_tokens||0) + (u.cache_read_input_tokens||0);
                const premiumMul = (is1M || totalCtx > 200000) ? p.ctxPremiumMul : 1.0;

                const inCost  = ((u.input_tokens||0) / 1_000_000) * p.input * premiumMul;
                const ccCost  = ((u.cache_creation_input_tokens||0) / 1_000_000) * p.input * CACHE_WRITE_MULTIPLIER * premiumMul;
                const crCost  = ((u.cache_read_input_tokens||0) / 1_000_000) * p.input * CACHE_READ_MULTIPLIER * premiumMul;
                const outCost = ((u.output_tokens||0) / 1_000_000) * p.output * premiumMul;
                const subtotal = inCost + ccCost + crCost + outCost;
                total += subtotal;
                if (!byModel[modelId]) byModel[modelId] = 0;
                byModel[modelId] += subtotal;
            } catch (_) {}
        }
        return { total, byModel, isActual: true };
    } catch (e) {
        return { total: 0, byModel: {}, isActual: false, error: e.message };
    }
}

function formatCost(usd) {
    if (usd === 0) return '$0.00';
    if (usd < 0.01) return '<$0.01';
    if (usd < 10) return `$${usd.toFixed(2)}`;
    if (usd < 100) return `$${usd.toFixed(1)}`;
    return `$${Math.round(usd)}`;
}

// ============================================================================
// EFFORT LEVEL detection
// ============================================================================
function getEffortLevel(data) {
    // Priority: data payload > env > settings.json
    if (data?.effortLevel) return String(data.effortLevel);
    if (process.env.CLAUDE_CODE_EFFORT_LEVEL) return process.env.CLAUDE_CODE_EFFORT_LEVEL;
    try {
        const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            if (settings.effortLevel) return settings.effortLevel;
        }
    } catch (_) {}
    return null;
}

// Truncate string to max length with ellipsis
function truncate(str, max) {
    if (str.length <= max) return str;
    return str.slice(0, max - 1) + '…';
}

// Measure visible terminal width of a string (accounts for wide emoji = 2 cols)
function visWidth(str) {
    // Strip ANSI escape codes first
    const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
    let w = 0;
    for (const ch of clean) {
        const cp = ch.codePointAt(0);
        // Emoji and wide chars: surrogate pairs (astral plane), emoji presentation, misc symbols
        if (cp > 0xFFFF || (cp >= 0x1F000 && cp <= 0x1FFFF) || (cp >= 0x2600 && cp <= 0x27BF) ||
            (cp >= 0x2300 && cp <= 0x23FF) || (cp >= 0xFE00 && cp <= 0xFE0F) ||
            (cp >= 0x200D && cp <= 0x200D)) {
            // Variation selectors and ZWJ are zero-width
            if ((cp >= 0xFE00 && cp <= 0xFE0F) || cp === 0x200D) {
                w += 0;
            } else {
                w += 2;
            }
        } else {
            w += 1;
        }
    }
    return w;
}

// Function to get git branch info
function getGitBranch(dir) {
    try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000
        }).trim();

        const statusOut = execSync('git status --porcelain', {
            cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000
        }).trim();

        const lines = statusOut ? statusOut.split('\n') : [];
        const staged = lines.filter(l => l.length >= 2 && l[0] !== ' ' && l[0] !== '?').length;
        const dirty = lines.some(l => l.length >= 2 && (l[1] !== ' ' || l[0] === '?'));

        let ahead = 0;
        try {
            const aheadOut = execSync('git rev-list @{u}..HEAD --count', {
                cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000
            }).trim();
            ahead = parseInt(aheadOut, 10) || 0;
        } catch (e) { /* no upstream configured */ }

        const indicators = [`🌿 ${branch}`];
        if (dirty) indicators.push('✏️');
        if (staged > 0) indicators.push(`📦 ${staged}`);
        if (ahead > 0) indicators.push(`🚀 ${ahead}`);
        return { parts: indicators };
    } catch (error) {
        return null;
    }
}

// Weather cache configuration
const WEATHER_CACHE_FILE = path.join(os.tmpdir(), 'claude-statusline-weather.json');
const WEATHER_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const CACHE_VERSION = '1.0'; // Cache version for invalidation

// Bitcoin cache configuration
const BITCOIN_CACHE_FILE = path.join(os.tmpdir(), 'claude-statusline-bitcoin.json');
const BITCOIN_CACHE_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

// HTTP agent for connection pooling
const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 5,
    keepAliveMsecs: 30000
});

// Function to make HTTPS requests with timeout and retry logic
async function httpsRequestWithRetry(url, maxRetries = 3, timeout = 3000) {
    let lastError;
    let delay = 100; // Initial delay for exponential backoff

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                // Exponential backoff: 100ms, 200ms, 400ms
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2;
            }

            const data = await httpsRequest(url, timeout);
            return data;
        } catch (error) {
            lastError = error;
            // Continue to next retry
        }
    }

    throw lastError;
}

// Function to make HTTPS requests with timeout
function httpsRequest(url, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            timeout,
            agent: httpsAgent
        };

        const req = https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.on('error', reject);
    });
}

// Function to get Bitcoin price
async function getBitcoinPrice() {
    try {
        // Check cache first
        const cached = getCachedBitcoin();
        if (cached) {
            return cached;
        }

        // Fetch from Coinbase API with retry logic
        const response = await httpsRequestWithRetry('https://api.coinbase.com/v2/exchange-rates?currency=BTC', 3, 3000);
        const data = JSON.parse(response);

        const price = parseFloat(data.data.rates.USD);
        const formatted = `₿$${(price / 1000).toFixed(0)}k`;

        // Cache the result
        cacheBitcoin(formatted);
        return formatted;

    } catch (error) {
        return '₿--k';
    }
}

// Function to get cached Bitcoin data
function getCachedBitcoin() {
    try {
        if (fs.existsSync(BITCOIN_CACHE_FILE)) {
            const cached = JSON.parse(fs.readFileSync(BITCOIN_CACHE_FILE, 'utf8'));
            const now = Date.now();

            if (now - cached.timestamp < BITCOIN_CACHE_DURATION) {
                return cached.data;
            }
        }
    } catch (error) {
        // Ignore cache errors and fetch fresh data
    }
    return null;
}

// Function to cache Bitcoin data
function cacheBitcoin(bitcoinData) {
    try {
        const cacheData = {
            timestamp: Date.now(),
            data: bitcoinData
        };
        fs.writeFileSync(BITCOIN_CACHE_FILE, JSON.stringify(cacheData));
    } catch (error) {
        // Ignore cache write errors
    }
}

// ========================================
// CLAUDE USAGE API FUNCTIONS (CROSS-PLATFORM)
// ========================================

// Function to get cached API usage data
function getCachedApiUsage(staleOk = false) {
    try {
        if (fs.existsSync(USAGE_API_CACHE_FILE)) {
            const cached = JSON.parse(fs.readFileSync(USAGE_API_CACHE_FILE, 'utf8'));
            const now = Date.now();

            if (now - cached.timestamp < USAGE_API_CACHE_DURATION) {
                return cached.data;
            }
            // Return stale data if caller accepts it (better than showing nothing)
            if (staleOk) return cached.data;
        }
    } catch (error) {
        // Ignore cache errors and fetch fresh data
    }
    return null;
}

// Function to cache API usage data
function cacheApiUsage(data) {
    try {
        const cacheData = {
            timestamp: Date.now(),
            data: data
        };
        fs.writeFileSync(USAGE_API_CACHE_FILE, JSON.stringify(cacheData));
    } catch (error) {
        // Ignore cache write errors
    }
}

// Exponential backoff — shared across all Claude Code sessions via temp file.
// Prevents N sessions from hammering a rate-limited API every 10 minutes.
function isInBackoff() {
    try {
        if (fs.existsSync(USAGE_API_BACKOFF_FILE)) {
            const state = JSON.parse(fs.readFileSync(USAGE_API_BACKOFF_FILE, 'utf8'));
            const elapsed = Date.now() - state.lastFailure;
            const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, state.failures - 1), BACKOFF_MAX_MS);
            if (elapsed < delay) {
                if (process.env.DEBUG_STATUSLINE) {
                    const remainSec = Math.round((delay - elapsed) / 1000);
                    console.error(`[DEBUG] API backoff active: ${state.failures} failures, ${remainSec}s remaining (delay=${Math.round(delay/1000)}s)`);
                }
                return true;
            }
        }
    } catch (e) {}
    return false;
}

function recordBackoffFailure() {
    try {
        let failures = 1;
        if (fs.existsSync(USAGE_API_BACKOFF_FILE)) {
            const state = JSON.parse(fs.readFileSync(USAGE_API_BACKOFF_FILE, 'utf8'));
            failures = (state.failures || 0) + 1;
        }
        fs.writeFileSync(USAGE_API_BACKOFF_FILE, JSON.stringify({ lastFailure: Date.now(), failures }));
        if (process.env.DEBUG_STATUSLINE) {
            const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, failures - 1), BACKOFF_MAX_MS);
            console.error(`[DEBUG] API backoff recorded: failure #${failures}, next retry in ${Math.round(delay/1000)}s`);
        }
    } catch (e) {}
}

function clearBackoff() {
    try { fs.unlinkSync(USAGE_API_BACKOFF_FILE); } catch (e) {}
}

// Returns human-readable backoff info for statusline display, or null if not in backoff
function getBackoffInfo() {
    try {
        if (fs.existsSync(USAGE_API_BACKOFF_FILE)) {
            const state = JSON.parse(fs.readFileSync(USAGE_API_BACKOFF_FILE, 'utf8'));
            const elapsed = Date.now() - state.lastFailure;
            const delay = Math.min(BACKOFF_BASE_MS * Math.pow(2, state.failures - 1), BACKOFF_MAX_MS);
            const remainMs = delay - elapsed;
            if (remainMs > 0) {
                const mins = Math.ceil(remainMs / 60000);
                return { failures: state.failures, retryIn: mins <= 60 ? `${mins}m` : `${Math.round(mins/60)}h` };
            }
        }
    } catch (e) {}
    return null;
}

// Function to load credentials from config file
function loadUsageCredentials() {
    try {
        if (!fs.existsSync(USAGE_API_CONFIG.credentialsPath)) {
            return null;
        }
        const creds = JSON.parse(fs.readFileSync(USAGE_API_CONFIG.credentialsPath, 'utf8'));
        if (!creds.sessionKey || !creds.orgId) {
            return null;
        }
        return creds;
    } catch (error) {
        return null;
    }
}

// Function to fetch usage data via Swift script (macOS) or fallback
// Swift bypasses Cloudflare protection that blocks Node.js https requests
function fetchClaudeApiUsage() {
    return new Promise((resolve, reject) => {
        // Check cache first
        const cached = getCachedApiUsage();
        if (cached) {
            resolve(cached);
            return;
        }

        // Respect shared backoff — don't hit the API if another session just failed
        if (isInBackoff()) {
            const stale = getCachedApiUsage(true);
            if (stale) { resolve(stale); return; }
            reject(new Error('API in backoff'));
            return;
        }

        // On macOS, use Swift script which bypasses Cloudflare
        const scriptPath = path.join(os.homedir(), '.claude/fetch-claude-usage.swift');
        if (os.platform() === 'darwin' && fs.existsSync(scriptPath)) {
            try {
                const output = execSync(scriptPath, {
                    encoding: 'utf8',
                    timeout: 5000,
                    stdio: ['ignore', 'pipe', 'ignore']
                }).trim();

                // Parse output: "5|2026-02-04T13:00:00|45|2026-02-08T03:00:00|1|2026-02-08T19:00:00"
                // Format: 5H_UTIL|5H_RESET|WEEKLY_UTIL|WEEKLY_RESET|SONNET_UTIL|SONNET_RESET
                const parts = output.split('|');

                if (parts[0].startsWith('ERROR')) {
                    reject(new Error(output));
                    return;
                }

                if (parts.length >= 6) {
                    const usageData = {
                        fiveHour: {
                            utilization: parseInt(parts[0], 10) || 0,
                            resetsAt: parts[1] || null
                        },
                        weekly: {
                            utilization: parseInt(parts[2], 10) || 0,
                            resetsAt: parts[3] || null
                        },
                        sonnet: {
                            utilization: parseInt(parts[4], 10) || 0,
                            resetsAt: parts[5] || null
                        }
                    };

                    // Debug output
                    if (process.env.DEBUG_STATUSLINE) {
                        console.error(`[DEBUG] Claude API Usage (via Swift):
                          5h: ${usageData.fiveHour.utilization}% (resets: ${usageData.fiveHour.resetsAt})
                          Weekly: ${usageData.weekly.utilization}% (resets: ${usageData.weekly.resetsAt})
                          Sonnet: ${usageData.sonnet.utilization}% (resets: ${usageData.sonnet.resetsAt})`);
                    }

                    // Cache the result
                    cacheApiUsage(usageData);
                    clearBackoff();
                    resolve(usageData);
                    return;
                }
            } catch (error) {
                if (process.env.DEBUG_STATUSLINE) {
                    console.error(`[DEBUG] Swift script error: ${error.message}`);
                }
            }
        }

        // On Windows, use curl which bypasses Cloudflare better than Node.js https
        if (os.platform() === 'win32') {
            const creds = loadUsageCredentials();
            if (creds && creds.sessionKey && creds.orgId) {
                try {
                    const curlCmd = `curl -s -H "Cookie: sessionKey=${creds.sessionKey}" -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" -H "Accept: application/json" "https://claude.ai/api/organizations/${creds.orgId}/usage"`;
                    const output = execSync(curlCmd, {
                        encoding: 'utf8',
                        timeout: 10000,
                        stdio: ['ignore', 'pipe', 'ignore'],
                        shell: true
                    }).trim();

                    const json = JSON.parse(output);

                    // Reject error responses (rate limit, auth failures, etc.)
                    if (json.error || !json.five_hour) {
                        throw new Error(`API error: ${json.error?.message || 'missing five_hour field'}`);
                    }

                    const fiveHour = json.five_hour;
                    const sevenDay = json.seven_day || {};
                    const sevenDaySonnet = json.seven_day_sonnet || {};

                    const usageData = {
                        fiveHour: {
                            utilization: Math.round(fiveHour.utilization || 0),
                            resetsAt: fiveHour.resets_at || null
                        },
                        weekly: {
                            utilization: Math.round(sevenDay.utilization || 0),
                            resetsAt: sevenDay.resets_at || null
                        },
                        sonnet: {
                            utilization: Math.round(sevenDaySonnet.utilization || 0),
                            resetsAt: sevenDaySonnet.resets_at || null
                        }
                    };

                    if (process.env.DEBUG_STATUSLINE) {
                        console.error(`[DEBUG] Claude API Usage (via curl/Windows):
                          5h: ${usageData.fiveHour.utilization}% (resets: ${usageData.fiveHour.resetsAt})
                          Weekly: ${usageData.weekly.utilization}% (resets: ${usageData.weekly.resetsAt})
                          Sonnet: ${usageData.sonnet.utilization}% (resets: ${usageData.sonnet.resetsAt})`);
                    }

                    cacheApiUsage(usageData);
                    clearBackoff();
                    resolve(usageData);
                    return;
                } catch (error) {
                    if (process.env.DEBUG_STATUSLINE) {
                        console.error(`[DEBUG] Windows curl error: ${error.message}`);
                    }
                    // API-level errors (rate limit, auth) → reject immediately, don't double-hit via HTTPS
                    if (error.message && error.message.startsWith('API error:')) {
                        reject(error);
                        return;
                    }
                    // Network/parse errors → fall through to Node.js fallback
                }
            }
        }

        // Fallback: Try direct API call (may be blocked by Cloudflare on some networks)
        const creds = loadUsageCredentials();
        if (!creds) {
            reject(new Error('No credentials configured'));
            return;
        }

        // Validate orgId (no path traversal)
        if (creds.orgId.includes('..') || creds.orgId.includes('/')) {
            reject(new Error('Invalid organization ID'));
            return;
        }

        const options = {
            hostname: USAGE_API_CONFIG.apiBaseUrl,
            port: 443,
            path: `/api/organizations/${creds.orgId}/usage`,
            method: 'GET',
            headers: {
                'Cookie': `sessionKey=${creds.sessionKey}`,
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 5000,
            agent: httpsAgent
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    reject(new Error(`API returned ${res.statusCode}`));
                    return;
                }

                try {
                    const json = JSON.parse(data);

                    // Reject error responses (rate limit, auth failures, etc.)
                    if (json.error || !json.five_hour) {
                        reject(new Error(`API error: ${json.error?.message || 'missing five_hour field'}`));
                        return;
                    }

                    // Extract all usage data from API response
                    const fiveHour = json.five_hour;
                    const sevenDay = json.seven_day || {};
                    const sevenDaySonnet = json.seven_day_sonnet || {};

                    const usageData = {
                        fiveHour: {
                            utilization: Math.round(fiveHour.utilization || 0),
                            resetsAt: fiveHour.resets_at || null
                        },
                        weekly: {
                            utilization: Math.round(sevenDay.utilization || 0),
                            resetsAt: sevenDay.resets_at || null
                        },
                        sonnet: {
                            utilization: Math.round(sevenDaySonnet.utilization || 0),
                            resetsAt: sevenDaySonnet.resets_at || null
                        }
                    };

                    // Debug output
                    if (process.env.DEBUG_STATUSLINE) {
                        console.error(`[DEBUG] Claude API Usage (direct):
                          5h: ${usageData.fiveHour.utilization}% (resets: ${usageData.fiveHour.resetsAt})
                          Weekly: ${usageData.weekly.utilization}% (resets: ${usageData.weekly.resetsAt})
                          Sonnet: ${usageData.sonnet.utilization}% (resets: ${usageData.sonnet.resetsAt})`);
                    }

                    // Cache the result
                    cacheApiUsage(usageData);
                    clearBackoff();
                    resolve(usageData);

                } catch (parseError) {
                    reject(new Error('Failed to parse API response'));
                }
            });
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.on('error', reject);
        req.end();
    });
}

// Function to format time until reset (handles ISO timestamps from API)
function formatTimeUntilReset(resetTimestamp) {
    try {
        if (!resetTimestamp) return '';

        // Parse ISO timestamp string (e.g., "2026-02-08T03:00:00")
        let resetDate;
        if (typeof resetTimestamp === 'string') {
            resetDate = new Date(resetTimestamp);
        } else if (typeof resetTimestamp === 'number') {
            // Legacy: Convert Apple/Cocoa epoch (2001-01-01) to Unix epoch
            resetDate = new Date((resetTimestamp + 978307200) * 1000);
        } else {
            return '';
        }

        // Calculate time remaining in milliseconds
        const now = Date.now();
        const remaining = resetDate.getTime() - now;

        // If overdue or very soon
        if (remaining <= 0) {
            return 'soon';
        }

        // Convert to time units
        const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
        const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

        // Format based on time remaining
        if (days > 0) {
            return `${days}d ${hours}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return 'soon';
        }

    } catch (error) {
        return '';
    }
}

// Helper function to format tokens (reusing existing pattern)
function formatTokens(num) {
    if (num >= 1000) {
        return `${(num / 1000).toFixed(0)}K`;
    }
    return num.toString();
}

// ========================================
// LEGACY COMPATIBILITY (removed - now using unified API)
// ========================================
// Five-hour and weekly data now come from fetchClaudeApiUsage()

// Format ISO timestamp to HH:MM
function formatResetTime(isoTimestamp) {
    if (!isoTimestamp) return 'unknown';

    try {
        const date = new Date(isoTimestamp);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (error) {
        return 'unknown';
    }
}

// Create simple progress bar with ▓ and ░ characters.
// Clamp filled to [0, width] so percentages >100% (context over the limit) or any
// odd input never produce a negative .repeat() count (which throws RangeError and
// crashes the whole render, dropping to the '~' fallback).
function createSimpleProgressBar(percentage, width = 10) {
    const pct = Number.isFinite(percentage) ? percentage : 0;
    let filled = Math.round((pct / 100) * width);
    filled = Math.max(0, Math.min(width, filled));
    const empty = width - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
}

// Function to build compact usage tracker parts for combined line
// Now uses unified API data structure with fiveHour, weekly, and sonnet
function buildUsageTrackerLine(apiUsageData) {
    // Returns object with five-hour and weekly parts (or null if no data)
    if (!apiUsageData) return null;

    const parts = {};

    // Five-hour usage (if available) - compact version
    if (apiUsageData.fiveHour && apiUsageData.fiveHour.utilization !== undefined) {
        const percentage = apiUsageData.fiveHour.utilization;
        const simpleBar = createSimpleProgressBar(percentage, 5); // Shorter bar
        const resetTime = formatResetTime(apiUsageData.fiveHour.resetsAt);

        // Color code based on thresholds
        let barColor = colors.green;
        if (percentage > 70) barColor = colors.yellow;
        if (percentage > 85) barColor = colors.red;

        parts.fiveHour = `${colors.dim}5h:${colors.reset} ${barColor}${simpleBar}${colors.reset} ${percentage}% ${colors.dim}→${resetTime}${colors.reset}`;
    }

    // Weekly usage (if available) - compact version
    if (apiUsageData.weekly && apiUsageData.weekly.utilization !== undefined) {
        const percentage = apiUsageData.weekly.utilization;

        // Color code based on percentage
        let wkColor = colors.green;
        if (percentage > 70) wkColor = colors.yellow;
        if (percentage > 85) wkColor = colors.red;

        const progressBar = createSimpleProgressBar(percentage, 6); // Shorter bar
        const timeUntilReset = formatTimeUntilReset(apiUsageData.weekly.resetsAt);
        const timeDisplay = timeUntilReset ? `${colors.dim}→${timeUntilReset}${colors.reset}` : '';

        parts.weekly = `${colors.dim}Wk:${colors.reset} ${wkColor}${progressBar}${colors.reset} ${percentage}% ${timeDisplay}`;
    }

    // Sonnet weekly usage (if available and > 0) - compact version
    if (apiUsageData.sonnet && apiUsageData.sonnet.utilization > 0) {
        const percentage = apiUsageData.sonnet.utilization;

        let snColor = colors.green;
        if (percentage > 70) snColor = colors.yellow;
        if (percentage > 85) snColor = colors.red;

        const progressBar = createSimpleProgressBar(percentage, 4);
        parts.sonnet = `${colors.dim}Sn:${colors.reset} ${snColor}${progressBar}${colors.reset} ${percentage}%`;
    }

    // Return parts object (or null if no data)
    if (Object.keys(parts).length === 0) return null;
    return parts;
}

// Function to get cached weather data
function getCachedWeather() {
    try {
        if (fs.existsSync(WEATHER_CACHE_FILE)) {
            const cached = JSON.parse(fs.readFileSync(WEATHER_CACHE_FILE, 'utf8'));
            const now = Date.now();

            // Check cache version and expiration
            if (cached.version === CACHE_VERSION && now - cached.timestamp < WEATHER_CACHE_DURATION) {
                return cached.data;
            }
        }
    } catch (error) {
        // Ignore cache errors and fetch fresh data
    }
    return null;
}

// Function to cache weather data
function cacheWeather(weatherData) {
    try {
        const cacheData = {
            timestamp: Date.now(),
            version: CACHE_VERSION,
            data: weatherData
        };
        fs.writeFileSync(WEATHER_CACHE_FILE, JSON.stringify(cacheData));
    } catch (error) {
        // Ignore cache write errors
    }
}

// Function to fetch real weather data
async function fetchRealWeather() {
    try {
        // Check cache first
        const cached = getCachedWeather();
        if (cached) {
            return cached;
        }

        // Try multiple approaches for better reliability
        let weatherData = null;
        let error = null;

        // Primary: Try zip code with retry logic
        if (WEATHER_CONFIG.zipCode) try {
            const response1 = await httpsRequestWithRetry(`https://wttr.in/${WEATHER_CONFIG.zipCode}?format=%t|%C|%l&${WEATHER_CONFIG.celsius ? 'm' : 'u'}&q`, 2, 3000);
            weatherData = response1.trim();
            if (weatherData && !weatherData.includes('Unknown location') && !weatherData.includes('not found')) {
                // Success with zip code
            } else {
                throw new Error('Invalid response from zip code');
            }
        } catch (err) {
            error = err;
        }

        // Fallback: Try city name
        if (!weatherData) try {
            const response2 = await httpsRequestWithRetry(`https://wttr.in/${WEATHER_CONFIG.cityName}?format=%t|%C|%l&${WEATHER_CONFIG.celsius ? 'm' : 'u'}&q`, 2, 3000);
            weatherData = response2.trim();
            if (!weatherData || weatherData.includes('Unknown location') || weatherData.includes('not found')) {
                throw new Error('Invalid response from city name');
            }
        } catch (err2) {
            // Final fallback: Try coordinates
            try {
                const response3 = await httpsRequestWithRetry(`https://wttr.in/${WEATHER_CONFIG.latitude},${WEATHER_CONFIG.longitude}?format=%t|%C|%l&${WEATHER_CONFIG.celsius ? 'm' : 'u'}&q`, 2, 3000);
                weatherData = response3.trim();
                if (!weatherData || weatherData.includes('Unknown location') || weatherData.includes('not found')) {
                    throw new Error('All weather sources failed');
                }
            } catch (err3) {
                throw new Error('All weather sources failed');
            }
        }

        const [temp, condition, location] = weatherData.split('|');

        // Validate the temperature format
        if (!temp || !temp.trim().match(/[+-]?\d+°[FC]/)) {
            throw new Error('Invalid temperature format');
        }

        // Get weather emoji based on condition
        const weatherEmoji = getWeatherEmoji(condition || 'Unknown');

        const formattedWeather = {
            display: `${weatherEmoji} ${temp.trim()}`,
            condition: (condition || 'Unknown').trim(),
            location: (location || WEATHER_CONFIG.defaultLocation).trim()
        };

        // Cache the result
        cacheWeather(formattedWeather);

        return formattedWeather;

    } catch (error) {
        // Return fallback weather but with more informative display
        return {
            display: '🌡️ --°F',
            condition: 'Unknown',
            location: WEATHER_CONFIG.defaultLocation
        };
    }
}

// Function to get weather emoji based on condition
function getWeatherEmoji(condition) {
    const conditionLower = condition.toLowerCase();

    if (conditionLower.includes('sunny') || conditionLower.includes('clear')) {
        return '☀️';
    } else if (conditionLower.includes('partly cloudy') || conditionLower.includes('partial')) {
        return '⛅';
    } else if (conditionLower.includes('cloudy') || conditionLower.includes('overcast')) {
        return '☁️';
    } else if (conditionLower.includes('rain') || conditionLower.includes('drizzle')) {
        return '🌧️';
    } else if (conditionLower.includes('storm') || conditionLower.includes('thunder')) {
        return '⛈️';
    } else if (conditionLower.includes('snow') || conditionLower.includes('blizzard')) {
        return '❄️';
    } else if (conditionLower.includes('fog') || conditionLower.includes('mist')) {
        return '🌫️';
    } else if (conditionLower.includes('wind')) {
        return '💨';
    } else {
        return '🌡️';
    }
}

// Function to get weather (with real API integration)
function getWeather() {
    // Return cached weather synchronously if available, otherwise return fallback
    const cached = getCachedWeather();
    if (cached) {
        return cached.display;
    }

    // Start async fetch in background but don't wait for it
    fetchRealWeather().catch(() => {
        // Ignore errors in background fetch
    });

    return '🌡️ --°'; // Fallback while loading
}

// Function to format date and time
function getDateTime() {
    const now = new Date();

    // Date format: MM/DD/YY
    const date = now.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: '2-digit'
    });

    // Time format: HH:MM:SS
    const time = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    // Day of week (abbreviated)
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'short' });

    return {
        date,
        time,
        dayOfWeek
    };
}

// Main function to generate status line
async function generateStatusLine() {
    let input = '';

    return new Promise((resolve) => {
        // Read from stdin
        process.stdin.setEncoding('utf8');

        process.stdin.on('readable', () => {
            const chunk = process.stdin.read();
            if (chunk !== null) {
                input += chunk;
            }
        });

        process.stdin.on('end', async () => {
            try {
                const data = input ? JSON.parse(input) : {};

                // Debug mode: Log the data structure to understand what Claude Code sends
                // Set DEBUG_STATUSLINE=1 environment variable to enable debug logging
                if (process.env.DEBUG_STATUSLINE) {
                    const debugData = {
                        timestamp: new Date().toISOString(),
                        inputData: data,
                        transcriptExists: data.transcript_path && fs.existsSync(data.transcript_path),
                        transcriptPath: data.transcript_path
                    };
                    fs.writeFileSync(path.join(os.tmpdir(), 'claude-statusline-debug.json'), JSON.stringify(debugData, null, 2));
                }

                // Extract information.
                // Derive the display name from the model *id* (authoritative) rather than
                // trusting display_name, which can lag after a /model switch. The helper
                // also strips any "(1M context)" suffix so the [1M] badge isn't doubled.
                const model = modelDisplayName(data.model?.id, data.model?.display_name);
                const currentDir = data.workspace?.current_dir || process.cwd();
                const dirName = path.basename(currentDir);
                const contextUsage = getActualTokenUsage(data);
                const dateTime = getDateTime();
                const gitBranch = getGitBranch(currentDir);

                // CACHE-ONLY reads: never await network fetches (they cause timeouts).
                // Background refreshes fire-and-forget for next invocation.
                const weather = getWeather();
                fetchRealWeather().catch(() => {}); // refresh cache in background

                const btcPrice = getCachedBitcoin() || '₿--k';
                getBitcoinPrice().catch(() => {}); // refresh cache in background

                const sessionCost = calculateSessionCost(data);
                const effortLevel = getEffortLevel(data);
                const sessionMeta = getSessionMeta(data);
                const todos = getSessionTodos(data.session_id);
                const mcpCount = getMcpCount();

                // Only fetch plan-quota data when the user opts in (saves a network round-trip per render).
                let apiUsageData = null;
                if (process.env.STATUSLINE_SHOW_PLAN_QUOTA === '1') {
                    apiUsageData = getCachedApiUsage() || getCachedApiUsage(true);
                    fetchClaudeApiUsage().catch((err) => {
                        const msg = String(err?.message || '').toLowerCase();
                        const skipBackoff = msg.includes('no credentials') || msg.includes('invalid organization') || msg.includes('api in backoff');
                        if (!skipBackoff) recordBackoffFailure();
                    });
                }

                // ── Fixed 3-line layout ───────────────────────────────────────────────
                // Line 1: 🤖 Model [200K/1M] 🎯 effort │ 📁 dir │ 🌿 branch
                // Line 2: 📅 date Day │ ⏰ time │ ₿btc │ 🌧️ weather │ ⚡
                // Line 3: Ctx: indicator bar% [used/limit] │ ⏱ timer │ 🔧 ver
                // ─────────────────────────────────────────────────────────────────────

                // ── Line 1 ────────────────────────────────────────────────────────────
                const windowLabel = contextUsage.limit >= 1000000 ? '[1M]' : '[200K]';
                const eColor = effortLevel === 'high' ? colors.red
                             : effortLevel === 'medium' ? colors.yellow
                             : colors.dim;
                const modelPart = `${colors.bright}${colors.cyan}🤖 ${model} ${windowLabel}${colors.reset}`;
                const sep = ` ${colors.dim}│${colors.reset} `;
                const effortPart = effortLevel
                    ? `${sep}${eColor}🎯 ${effortLevel}${colors.reset}${sep}`
                    : sep;
                const line1Tail = [`${colors.blue}📁 ${dirName}${colors.reset}`];
                if (gitBranch) {
                    for (const part of gitBranch.parts) {
                        line1Tail.push(`${colors.green}${part}${colors.reset}`);
                    }
                }
                if (todos) {
                    const todoColor = todos.inProgress > 0 ? colors.yellow : todos.open > 0 ? colors.cyan : colors.dim;
                    line1Tail.push(`${todoColor}📋 ${todos.open}/${todos.total}${colors.reset}`);
                }
                if (mcpCount) {
                    line1Tail.push(`${colors.dim}⚙️ ${mcpCount}${colors.reset}`);
                }

                // ── Line 2 ────────────────────────────────────────────────────────────
                const line2Parts = [
                    `${colors.magenta}📅 ${dateTime.date} ${dateTime.dayOfWeek}${colors.reset}`,
                    `${colors.yellow}⏰ ${dateTime.time}${colors.reset}`,
                    `${colors.bright}${colors.orange}${btcPrice}${colors.reset}`,
                    `${colors.green}${weather}${colors.reset}`
                ];
                const line2 = line2Parts.join(` ${colors.dim}│${colors.reset} `);

                // ── Line 3 ────────────────────────────────────────────────────────────
                // Session timer (cost intentionally omitted — user is on Max plan)
                const timerPart = sessionMeta.elapsedStr
                    ? `${colors.yellow}⏱ ${sessionMeta.elapsedStr}${colors.reset}`
                    : null;

                // Context bar — bold+bright when >80%
                const formatTokens = (num) => num >= 1000 ? `${(num / 1000).toFixed(0)}K` : num.toString();
                const limitLabel = contextUsage.limit >= 1000000 ? '1M' : `${Math.round(contextUsage.limit / 1000)}K`;
                const tokenDisplay = `${colors.dim}[${formatTokens(contextUsage.used)}/${limitLabel}]${colors.reset}`;

                const indicator = contextUsage.isActual
                    ? `${colors.bright}${colors.green}●${colors.reset}`
                    : `${colors.dim}${colors.yellow}~${colors.reset}`;

                let ctxColor = colors.green;
                if (contextUsage.percentage > 70) ctxColor = colors.yellow;
                if (contextUsage.percentage > 80) ctxColor = colors.red;
                const ctxBright = contextUsage.percentage > 80 ? colors.bright : '';

                const contextPart = `${colors.dim}Ctx:${colors.reset} ${indicator} ${ctxBright}${ctxColor}${createSimpleProgressBar(contextUsage.percentage, 6)}${colors.reset} ${ctxBright}${ctxColor}${contextUsage.percentage.toFixed(0)}%${colors.reset} ${tokenDisplay}`;

                const versionStr = `${colors.magenta}🔧 ${detectAndCacheVersion(data.version)}${colors.reset}`;
                const line3Parts = [contextPart];
                if (timerPart) line3Parts.push(timerPart);

                // Plan-quota bars (opt-in: STATUSLINE_SHOW_PLAN_QUOTA=1)
                const showPlanQuota = process.env.STATUSLINE_SHOW_PLAN_QUOTA === '1';
                if (showPlanQuota) {
                    const usageTrackerParts = buildUsageTrackerLine(apiUsageData);
                    if (usageTrackerParts) {
                        if (usageTrackerParts.fiveHour) line3Parts.push(usageTrackerParts.fiveHour);
                        if (usageTrackerParts.weekly)   line3Parts.push(usageTrackerParts.weekly);
                        if (usageTrackerParts.sonnet)   line3Parts.push(usageTrackerParts.sonnet);
                    } else if (process.env.STATUSLINE_SHOW_QUOTA_DIAGNOSTICS === '1') {
                        const backoff = getBackoffInfo();
                        if (backoff) {
                            line3Parts.push(`${colors.dim}5h:${colors.reset} ${colors.yellow}rate limited${colors.reset} ${colors.dim}retry ${backoff.retryIn} (#${backoff.failures})${colors.reset}`);
                        } else if (!getCachedApiUsage(true)) {
                            line3Parts.push(`${colors.dim}5h:${colors.reset} ${colors.dim}loading...${colors.reset}`);
                        }
                    }
                }
                line3Parts.push(versionStr);
                const line3 = line3Parts.join(` ${colors.dim}│${colors.reset} `);

                // ── Output ────────────────────────────────────────────────────────────
                console.log(modelPart + effortPart + line1Tail.join(sep));
                console.log(line2);
                console.log(line3);

                resolve();

            } catch (error) {
                // Fallback if JSON parsing fails
                const fallbackDateTime = getDateTime();
                const fallbackDir = path.basename(process.cwd());
                const fallbackGit = getGitBranch(process.cwd());
                const fallbackWeather = getWeather();
                const fallbackBtc = getCachedBitcoin() || '₿--k';

                // Fallback: same 3-line fixed layout. No model data available in this
                // path (JSON parse failed), so show a neutral label rather than a
                // hardcoded version that could be wrong.
                const fbLine1 = [
                    `${colors.bright}${colors.cyan}🤖 Claude [200K]${colors.reset}`,
                    `${colors.blue}📁 ${fallbackDir}${colors.reset}`
                ];
                if (fallbackGit) {
                    for (const part of fallbackGit.parts) {
                        fbLine1.push(`${colors.green}${part}${colors.reset}`);
                    }
                }

                const fbLine2 = [
                    `${colors.magenta}📅 ${fallbackDateTime.date} ${fallbackDateTime.dayOfWeek}${colors.reset}`,
                    `${colors.yellow}⏰ ${fallbackDateTime.time}${colors.reset}`,
                    `${colors.yellow}${fallbackBtc}${colors.reset}`,
                    `${colors.green}${fallbackWeather}${colors.reset}`,
                    `${colors.bright}${colors.yellow}⚡${colors.reset}`
                ].join(` ${colors.dim}│${colors.reset} `);

                const fbLine3 = `${colors.dim}Ctx:${colors.reset} ${colors.dim}${colors.yellow}~${colors.reset} ${createSimpleProgressBar(1, 6)} 1% ${colors.dim}[--/200K]${colors.reset} ${colors.dim}│${colors.reset} ${colors.magenta}🔧 ${detectAndCacheVersion(null)}${colors.reset}`;

                console.log(fbLine1.join(' │ '));
                console.log(fbLine2);
                console.log(fbLine3);

                resolve();
            }
        });
    });
}

// Preload weather and Bitcoin data in background on script startup
function preloadData() {
    // Only fetch if cache is expired or missing
    const cachedWeather = getCachedWeather();
    if (!cachedWeather) {
        fetchRealWeather().catch(() => {
            // Ignore errors in background preload
        });
    }

    // Preload Bitcoin price if not cached
    const cachedBitcoin = getCachedBitcoin();
    if (!cachedBitcoin) {
        getBitcoinPrice().catch(() => {
            // Ignore errors in background preload
        });
    }
}

// Test function for debugging token calculations
function testTokenCalculation() {
    // Test with mock data
    const mockData = {
        model: { id: 'claude-opus-4-8[1m]', display_name: 'Opus 4.8' },
        session_id: 'test-session-123',
        transcript_path: null, // Force fallback estimation
        workspace: { current_dir: process.cwd() },
        version: 'v1.0.0'
    };

    const result = getActualTokenUsage(mockData);
    console.log('Token calculation test result:');
    console.log(`  Used: ${result.used} tokens`);
    console.log(`  Limit: ${result.limit} tokens`);
    console.log(`  Percentage: ${result.percentage.toFixed(2)}%`);
    console.log(`  Is actual: ${result.isActual}`);
    console.log(`  Formatted: ${result.used >= 1000 ? `${(result.used / 1000).toFixed(0)}K` : result.used}/${result.limit >= 1000 ? `${(result.limit / 1000).toFixed(0)}K` : result.limit}`);
}

// Version cache configuration (avoids slow execSync every call)
const VERSION_CACHE_FILE = path.join(os.tmpdir(), 'claude-statusline-version.json');
const VERSION_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

function getCachedVersion() {
    try {
        if (fs.existsSync(VERSION_CACHE_FILE)) {
            const cache = JSON.parse(fs.readFileSync(VERSION_CACHE_FILE, 'utf8'));
            if (Date.now() - cache.timestamp < VERSION_CACHE_DURATION) {
                return cache.version;
            }
        }
    } catch (e) {}
    return null;
}

function detectAndCacheVersion(dataVersion) {
    if (dataVersion) {
        try { fs.writeFileSync(VERSION_CACHE_FILE, JSON.stringify({ version: dataVersion, timestamp: Date.now() })); } catch (e) {}
        return dataVersion;
    }
    const cached = getCachedVersion();
    if (cached) return cached;
    try {
        const v = execSync('claude --version 2>&1', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500, windowsHide: true }).trim();
        const m = v.match(/(?:claude\/)?v?(\d+\.\d+\.\d+)/);
        if (m) {
            try { fs.writeFileSync(VERSION_CACHE_FILE, JSON.stringify({ version: m[1], timestamp: Date.now() })); } catch (e) {}
            return m[1];
        }
    } catch (e) {}
    return '?.?.?';
}

// Run the status line generator or test
if (require.main === module) {
    // Check for test mode
    if (process.argv.includes('--test')) {
        testTokenCalculation();
        return;
    }

    // HARD DEADLINE: Output something within 3s. Claude Code kills statusline commands at ~5s.
    let outputProduced = false;
    const deadline = setTimeout(() => {
        if (!outputProduced) {
            outputProduced = true;
            const tw = process.stdout.columns || 120;
            const mw = (p) => visWidth(p.join(' │ '));
            const dt = getDateTime();
            const dir = path.basename(process.cwd());
            const git = getGitBranch(process.cwd());
            const w = getWeather();
            const btc = getCachedBitcoin() || '₿--k';
            const ver = getCachedVersion() || '?.?.?';
            const core = [
                `${colors.bright}${colors.cyan}🤖 Claude${colors.reset}`,
                `${colors.bright}${colors.yellow}⚡${colors.reset}`,
                `${colors.blue}📁 ${dir}${colors.reset}`
            ];
            if (git) {
                for (const part of git.parts) {
                    core.push(`${colors.green}${part}${colors.reset}`);
                }
            }
            const dlExtras = [
                `${colors.magenta}📅 ${dt.date}${colors.reset}`,
                `${colors.yellow}⏰ ${dt.time}${colors.reset}`,
                `${colors.cyan}📆 ${dt.dayOfWeek}${colors.reset}`,
                `${colors.green}${w}${colors.reset}`,
                `${colors.yellow}${btc}${colors.reset}`,
                `${colors.magenta}🔧 ${ver}${colors.reset}`
            ];
            const dlOverflow = [];
            for (const e of dlExtras) {
                if (mw([...core, e]) <= tw - 2) core.push(e);
                else dlOverflow.push(e);
            }
            console.log(core.join(' │ '));
            const ctxLine = `${colors.dim}Ctx:${colors.reset} ${colors.dim}${colors.yellow}~${colors.reset} ${colors.green}${createSimpleProgressBar(5, 6)}${colors.reset} ~5%`;
            if (dlOverflow.length > 0) {
                console.log(dlOverflow.join(' │ ') + ` ${colors.dim}│${colors.reset} ` + ctxLine);
            } else {
                console.log(ctxLine);
            }
            process.exit(0);
        }
    }, 3000);
    deadline.unref();

    // Start data preload in background
    preloadData();

    // Generate status line
    generateStatusLine().then(() => {
        outputProduced = true;
        clearTimeout(deadline);
    }).catch((err) => {
        if (!outputProduced) {
            outputProduced = true;
            clearTimeout(deadline);
            console.error(err);
        }
    });
}

module.exports = { generateStatusLine, colors, createProgressBar, fetchRealWeather, getCachedWeather, getBitcoinPrice };
