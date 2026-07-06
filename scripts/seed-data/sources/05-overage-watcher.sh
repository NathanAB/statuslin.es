#!/usr/bin/env bash
# claude-code-statusline — Enhanced status line for Claude Code
# https://github.com/aleksander-dytko/claude-code-statusline
# MIT License — Aleksander Dytko 2026
#
# Displays: model | git repo@branch | ctx | cost | 5h limit | 7d limit | extra usage

set -f  # disable globbing
export LC_NUMERIC=C  # ensure '.' is decimal separator regardless of locale
unset LC_ALL          # LC_ALL overrides LC_NUMERIC; unset it while preserving other locale vars

# Detect stat variant once (GNU vs BSD) to avoid repeated fallback forks
if stat -c %Y /dev/null >/dev/null 2>&1; then
    _stat_mtime() { stat -c %Y "$1" 2>/dev/null; }
else
    _stat_mtime() { stat -f %m "$1" 2>/dev/null; }
fi

# ─── Configuration (override via environment variables) ─────────────────────
STATUSLINE_SHOW_GIT="${STATUSLINE_SHOW_GIT:-true}"
STATUSLINE_SHOW_CONTEXT="${STATUSLINE_SHOW_CONTEXT:-true}"
STATUSLINE_SHOW_SESSION="${STATUSLINE_SHOW_SESSION:-true}"
STATUSLINE_SHOW_WEEKLY="${STATUSLINE_SHOW_WEEKLY:-true}"
STATUSLINE_SHOW_EXTRA="${STATUSLINE_SHOW_EXTRA:-true}"
STATUSLINE_SHOW_SESSION_COST="${STATUSLINE_SHOW_SESSION_COST:-true}"
STATUSLINE_SPLIT_LINES="${STATUSLINE_SPLIT_LINES:-false}"
STATUSLINE_CACHE_TTL="${STATUSLINE_CACHE_TTL:-60}"           # seconds between API fetches
STATUSLINE_CACHE_DIR="${STATUSLINE_CACHE_DIR:-/tmp/claude}"  # cache directory
STATUSLINE_CURRENCY_SYMBOL="${STATUSLINE_CURRENCY_SYMBOL:-$}"  # set to € for Europe
# ────────────────────────────────────────────────────────────────────────────

input=$(cat)

if [ -z "$input" ]; then
    printf "Claude"
    exit 0
fi

# Hard dependency check
if ! command -v jq >/dev/null 2>&1; then
    printf "Claude (install jq for full statusline — brew install jq)"
    exit 0
fi

# ─── ANSI colors ────────────────────────────────────────────────────────────
blue='\033[38;2;0;153;255m'
orange='\033[38;2;255;176;85m'
green='\033[38;2;0;160;0m'
cyan='\033[38;2;46;149;153m'
red='\033[38;2;255;85;85m'
yellow='\033[38;2;230;200;0m'
white='\033[38;2;220;220;220m'
dim='\033[2m'
reset='\033[0m'

# ─── Helper functions ────────────────────────────────────────────────────────

# ─── Color threshold reference ────────────────────────────────────────────────
# Context window:  green < 50% | yellow 50–75% | red ≥ 75%
# 5h session:      green < 70% | yellow 70–90% | red ≥ 90%
# 7d weekly:       green < 70% | yellow 70–90% | red ≥ 90%
# Extra usage:     green < 50% | yellow 50–80% | red ≥ 80%
# Session cost:    white (informational, no threshold coloring)
# Balance:         white (not available via OAuth API — field not returned)
# ⚡ on 5h/7d:     utilization ≥ 100 (plan limit hit, routing to extra billing)
# ⚡ on extra:     EITHER five_hour OR seven_day utilization ≥ 100
# ─────────────────────────────────────────────────────────────────────────────

# Format token counts: 50000 → "50k", 1200000 → "1.2m"
format_tokens() {
    local num=$1
    if [ "$num" -ge 1000000 ]; then
        awk "BEGIN {printf \"%.1fm\", $num / 1000000}"
    elif [ "$num" -ge 1000 ]; then
        awk "BEGIN {printf \"%.0fk\", $num / 1000}"
    else
        printf "%d" "$num"
    fi
}

# Color for plan limits (session / weekly): green < 70%, yellow 70-90%, red ≥ 90%
plan_color() {
    local pct=$1
    if   [ "$pct" -ge 90 ]; then echo "$red"
    elif [ "$pct" -ge 70 ]; then echo "$yellow"
    else echo "$green"
    fi
}

# Color for context window: green < 50%, yellow 50-75%, red ≥ 75%
context_color() {
    local pct=$1
    if   [ "$pct" -ge 75 ]; then echo "$red"
    elif [ "$pct" -ge 50 ]; then echo "$yellow"
    else echo "$green"
    fi
}

# Color for extra usage spend: green < 50%, yellow 50-80%, red ≥ 80%
extra_color() {
    local pct=$1
    if   [ "$pct" -ge 80 ]; then echo "$red"
    elif [ "$pct" -ge 50 ]; then echo "$yellow"
    else echo "$green"
    fi
}

# Resolve OAuth token — tries 4 sources in order
get_oauth_token() {
    # 1. Explicit env var override
    if [ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]; then
        echo "$CLAUDE_CODE_OAUTH_TOKEN"
        return 0
    fi

    # 2. macOS Keychain
    if command -v security >/dev/null 2>&1; then
        local blob
        blob=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null)
        if [ -n "$blob" ]; then
            local token
            token=$(echo "$blob" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
            if [ -n "$token" ] && [ "$token" != "null" ]; then
                echo "$token"; return 0
            fi
        fi
    fi

    # 3. Linux credentials file
    local creds_file="${HOME}/.claude/.credentials.json"
    if [ -f "$creds_file" ]; then
        local token
        token=$(jq -r '.claudeAiOauth.accessToken // empty' "$creds_file" 2>/dev/null)
        if [ -n "$token" ] && [ "$token" != "null" ]; then
            echo "$token"; return 0
        fi
    fi

    # 4. GNOME Keyring via secret-tool
    if command -v secret-tool >/dev/null 2>&1; then
        local blob
        blob=$(timeout 2 secret-tool lookup service "Claude Code-credentials" 2>/dev/null)
        if [ -n "$blob" ]; then
            local token
            token=$(echo "$blob" | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
            if [ -n "$token" ] && [ "$token" != "null" ]; then
                echo "$token"; return 0
            fi
        fi
    fi

    echo ""
}

# Convert ISO 8601 to Unix epoch (cross-platform: GNU date + BSD date)
iso_to_epoch() {
    local iso_str="$1"

    # GNU date (Linux)
    local epoch
    epoch=$(date -d "${iso_str}" +%s 2>/dev/null)
    [ -n "$epoch" ] && echo "$epoch" && return 0

    # BSD date (macOS)
    local stripped="${iso_str%%.*}"
    stripped="${stripped%%Z}"
    stripped="${stripped%%+*}"
    stripped="${stripped%%-[0-9][0-9]:[0-9][0-9]}"

    if [[ "$iso_str" == *"Z"* ]] || [[ "$iso_str" == *"+00:00"* ]] || [[ "$iso_str" == *"-00:00"* ]]; then
        epoch=$(env TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "$stripped" +%s 2>/dev/null)
    else
        epoch=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$stripped" +%s 2>/dev/null)
    fi

    [ -n "$epoch" ] && echo "$epoch" && return 0
    return 1
}

# Format ISO reset timestamp to compact local time
# Styles: time (4:30pm) | datetime (Mar 6, 4:30pm) | date (Mar 6)
format_reset_time() {
    local iso_str="$1"
    local style="$2"
    [ -z "$iso_str" ] || [ "$iso_str" = "null" ] && return

    local epoch
    epoch=$(iso_to_epoch "$iso_str") || return

    case "$style" in
        time)
            date -j -r "$epoch" +"%l:%M%p" 2>/dev/null | sed 's/^ //' | tr '[:upper:]' '[:lower:]' || \
            date -d "@$epoch" +"%l:%M%P" 2>/dev/null | sed 's/^ //'
            ;;
        datetime)
            date -j -r "$epoch" +"%b %-d, %l:%M%p" 2>/dev/null | sed 's/  / /g; s/^ //' | tr '[:upper:]' '[:lower:]' || \
            date -d "@$epoch" +"%b %-d, %l:%M%P" 2>/dev/null | sed 's/  / /g; s/^ //'
            ;;
        *)
            date -j -r "$epoch" +"%b %-d" 2>/dev/null | tr '[:upper:]' '[:lower:]' || \
            date -d "@$epoch" +"%b %-d" 2>/dev/null
            ;;
    esac
}

# Format time remaining until reset: epoch → "in 2h 24min", "in 47min", "soon"
format_countdown() {
    local iso_str="$1"
    [ -z "$iso_str" ] || [ "$iso_str" = "null" ] && return

    local epoch
    epoch=$(iso_to_epoch "$iso_str") || return

    local now diff hours mins
    now=$(date +%s)
    diff=$(( epoch - now ))

    [ "$diff" -le 0 ] && echo "soon" && return

    hours=$(( diff / 3600 ))
    mins=$(( (diff % 3600) / 60 ))

    if   [ "$hours" -ge 24 ]; then echo "resets in $(( hours / 24 ))d"
    elif [ "$hours" -ge 1 ];  then echo "resets in ${hours}h ${mins}min"
    else echo "resets in ${mins}min"
    fi
}

# ─── Parse stdin JSON ────────────────────────────────────────────────────────
model_name=$(echo "$input" | jq -r '.model.display_name // "Claude"')
cwd=$(echo "$input" | jq -r '.cwd // empty')

size=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')
[ "$size" -eq 0 ] 2>/dev/null && size=200000

input_tokens=$(echo "$input" | jq -r '.context_window.current_usage.input_tokens // 0')
cache_create=$(echo "$input" | jq -r '.context_window.current_usage.cache_creation_input_tokens // 0')
cache_read=$(echo "$input"   | jq -r '.context_window.current_usage.cache_read_input_tokens // 0')
current=$(( input_tokens + cache_create + cache_read ))

used_tokens=$(format_tokens "$current")
total_tokens=$(format_tokens "$size")

# Prefer stdin pre-calculated percentage; fall back to manual integer division
pct_used_stdin=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
if [ -n "$pct_used_stdin" ] && [ "$pct_used_stdin" != "null" ]; then
    pct_used=$(printf "%.0f" "$pct_used_stdin" 2>/dev/null || echo 0)
else
    pct_used=$(( size > 0 ? current * 100 / size : 0 ))
fi

# Session cost from stdin (no API call needed)
session_cost=$(echo "$input" | jq -r '.cost.total_cost_usd // 0')

# Worktree info from stdin (more accurate than git-dir path heuristic)
wt_name=$(echo "$input" | jq -r '.worktree.name // empty')

# ─── Fetch / cache usage API ─────────────────────────────────────────────────
cache_file="${STATUSLINE_CACHE_DIR}/statusline-usage-cache.json"
attempt_stamp="${STATUSLINE_CACHE_DIR}/statusline-fetch-attempt"
ratelimit_stamp="${STATUSLINE_CACHE_DIR}/statusline-ratelimited"
lock_dir="${STATUSLINE_CACHE_DIR}/statusline-fetch.lock"
mkdir -p "${STATUSLINE_CACHE_DIR}"

now=$(date +%s)
usage_data=""

# Always load valid cached data for display (even if stale — shown while refreshing)
if [ -f "$cache_file" ]; then
    cached=$(cat "$cache_file" 2>/dev/null)
    echo "$cached" | jq -e '.five_hour' >/dev/null 2>&1 && usage_data="$cached"
fi

# Exponential backoff for rate limits: 30s → 60s → 120s → 240s → 300s (capped)
# Count of consecutive 429s is stored in the ratelimit_stamp file content.
rl_count=0
ratelimited=false
if [ -f "$ratelimit_stamp" ]; then
    rl_count=$(cat "$ratelimit_stamp" 2>/dev/null | tr -d '[:space:]')
    [[ "$rl_count" =~ ^[0-9]+$ ]] || rl_count=1
    [ "$rl_count" -lt 1 ] && rl_count=1
    rl_mtime=$(_stat_mtime "$ratelimit_stamp" || echo 0)
    rl_backoff=$(( 30 * (1 << (rl_count - 1)) ))   # 30 * 2^(n-1)
    [ "$rl_backoff" -gt 300 ] && rl_backoff=300     # cap at 5 min
    [ $(( now - rl_mtime )) -lt "$rl_backoff" ] && ratelimited=true
fi

# Throttle fetches: only attempt once per TTL period regardless of success/failure
needs_refresh=false
if ! $ratelimited; then
    needs_refresh=true
    if [ -f "$attempt_stamp" ]; then
        stamp_mtime=$(_stat_mtime "$attempt_stamp" || echo 0)
        [ $(( now - stamp_mtime )) -lt "$STATUSLINE_CACHE_TTL" ] && needs_refresh=false
    fi
fi

if $needs_refresh; then
    # Atomic lock: mkdir is POSIX-atomic — only one session fetches at a time
    # If mkdir fails, check for stale lock (crashed holder) and retry once
    got_lock=false
    if mkdir "$lock_dir" 2>/dev/null; then
        got_lock=true
    else
        lock_mtime=$(_stat_mtime "$lock_dir" || echo 0)
        if [ $(( now - lock_mtime )) -gt 30 ]; then
            rmdir "$lock_dir" 2>/dev/null && mkdir "$lock_dir" 2>/dev/null && got_lock=true
        fi
    fi
    if $got_lock; then
        trap 'rmdir "$lock_dir" 2>/dev/null' INT TERM EXIT
        touch "$attempt_stamp"
        token=$(get_oauth_token)
        if [ -n "$token" ] && [ "$token" != "null" ]; then
            response=$(curl -s --max-time 8 \
                -H "Accept: application/json" \
                -H "Content-Type: application/json" \
                -H "Authorization: Bearer $token" \
                -H "anthropic-beta: oauth-2025-04-20" \
                -H "User-Agent: claude-code-statusline/1.0.0" \
                "https://api.anthropic.com/api/oauth/usage" 2>/dev/null)
            if [ -n "$response" ] && echo "$response" | jq -e '.five_hour' >/dev/null 2>&1; then
                usage_data="$response"
                echo "$response" > "$cache_file"
                rm -f "$ratelimit_stamp"  # success — reset backoff
            elif echo "$response" | jq -e '.error.type == "rate_limit_error"' >/dev/null 2>&1; then
                echo $(( rl_count + 1 )) > "$ratelimit_stamp"  # increment backoff counter
            fi
        fi
        rmdir "$lock_dir" 2>/dev/null
        trap - INT TERM EXIT
    fi
    # If mkdir failed, another session holds the lock — silently use cached data
fi

# ─── Build output ────────────────────────────────────────────────────────────
sep=" ${dim}|${reset} "
out1=""  # stdin-based: model, git, ctx, cost  (always available, per-session)
out2=""  # API-based:   5h, 7d, extra          (cached, shared across tabs)

# Append to out2 with auto-separator
append2() { [ -n "$out2" ] && out2+="$sep"; out2+="$1"; }

# Model name
out1+="${blue}${model_name}${reset}"

# Git: project[wt]@branch +adds/-dels
if [ "${STATUSLINE_SHOW_GIT}" = "true" ] && [ -n "$cwd" ]; then
    display_dir="${cwd##*/}"
    git_branch=$(git -C "${cwd}" rev-parse --abbrev-ref HEAD 2>/dev/null)
    out1+="${sep}${cyan}${display_dir}${reset}"
    if [ -n "$git_branch" ]; then
        # Worktree detection: prefer stdin worktree.name (accurate); fallback to git-dir path heuristic
        if [ -n "$wt_name" ]; then
            out1+="${dim}[wt:${wt_name}]${reset}"
        else
            git_dir=$(git -C "${cwd}" rev-parse --git-dir 2>/dev/null)
            [[ "$git_dir" == *"/worktrees/"* ]] && out1+="${dim}[wt]${reset}"
        fi
        out1+="${dim}@${reset}${green}${git_branch}${reset}"
        # Use HEAD diff to include both staged and unstaged changes
        git_stat=$(git -C "${cwd}" diff HEAD --numstat 2>/dev/null | awk '{a+=$1; d+=$2} END {if (a+d>0) printf "+%d -%d", a, d}')
        if [ -n "$git_stat" ]; then
            adds="${git_stat%% *}"
            dels="${git_stat##* }"
            out1+=" ${dim}(${reset}${green}${adds}${reset} ${red}${dels}${reset}${dim})${reset}"
        fi
    fi
fi

# Context window
if [ "${STATUSLINE_SHOW_CONTEXT}" = "true" ]; then
    ctx_color=$(context_color "$pct_used")
    out1+="${sep}${white}ctx${reset} ${orange}${used_tokens}/${total_tokens}${reset} ${dim}(${reset}${ctx_color}${pct_used}%${reset}${dim})${reset}"
fi

# Session cost (from stdin, no API call)
if [ "${STATUSLINE_SHOW_SESSION_COST}" = "true" ]; then
    cost_fmt=$(printf "%.2f" "$session_cost" 2>/dev/null || echo "0.00")
    sym="${STATUSLINE_CURRENCY_SYMBOL}"
    out1+="${sep}${white}cost ${sym}${cost_fmt}${reset}"
fi

# Usage limits from API
if [ -n "$usage_data" ]; then

    five_pct=$(echo "$usage_data" | jq -r '.five_hour.utilization // 0' | awk '{printf "%.0f", $1}')
    five_reset_iso=$(echo "$usage_data" | jq -r '.five_hour.resets_at // empty')
    seven_pct=$(echo "$usage_data" | jq -r '.seven_day.utilization // 0' | awk '{printf "%.0f", $1}')
    seven_reset_iso=$(echo "$usage_data" | jq -r '.seven_day.resets_at // empty')

    # ⚡ fires on whichever limit is currently causing overflow (real-time signal)
    five_on_extra=false
    seven_on_extra=false
    [ "$five_pct" -ge 100 ] && five_on_extra=true
    [ "$seven_pct" -ge 100 ] && seven_on_extra=true

    # 5-hour session limit
    if [ "${STATUSLINE_SHOW_SESSION}" = "true" ]; then
        five_color=$(plan_color "$five_pct")
        five_label="5h"
        $five_on_extra && five_label="⚡ 5h"

        seg="${white}${five_label}${reset} ${five_color}${five_pct}%${reset}"
        if $five_on_extra; then
            five_countdown=$(format_countdown "$five_reset_iso")
            [ -n "$five_countdown" ] && seg+=" ${dim}${five_countdown}${reset}"
        else
            five_reset=$(format_reset_time "$five_reset_iso" "time")
            [ -n "$five_reset" ] && seg+=" ${dim}@${five_reset}${reset}"
        fi
        append2 "$seg"
    fi

    # 7-day weekly limit
    if [ "${STATUSLINE_SHOW_WEEKLY}" = "true" ]; then
        seven_color=$(plan_color "$seven_pct")
        seven_label="7d"
        $seven_on_extra && seven_label="⚡ 7d"

        seg="${white}${seven_label}${reset} ${seven_color}${seven_pct}%${reset}"
        if $seven_on_extra; then
            seven_countdown=$(format_countdown "$seven_reset_iso")
            [ -n "$seven_countdown" ] && seg+=" ${dim}${seven_countdown}${reset}"
        else
            seven_reset=$(format_reset_time "$seven_reset_iso" "datetime")
            [ -n "$seven_reset" ] && seg+=" ${dim}@${seven_reset}${reset}"
        fi
        append2 "$seg"
    fi

    # Extra usage — monthly billing summary (shown when extra is enabled)
    if [ "${STATUSLINE_SHOW_EXTRA}" = "true" ]; then
        extra_enabled=$(echo "$usage_data" | jq -r '.extra_usage.is_enabled // false')
        if [ "$extra_enabled" = "true" ]; then
            extra_pct=$(echo "$usage_data" | jq -r '.extra_usage.utilization // 0' | awk '{printf "%.0f", $1}')
            extra_used=$(echo "$usage_data" | jq -r '.extra_usage.used_credits // 0' | awk '{printf "%.2f", $1/100}')
            extra_limit=$(echo "$usage_data" | jq -r '.extra_usage.monthly_limit // 0' | awk '{printf "%.2f", $1/100}')
            extra_clr=$(extra_color "$extra_pct")

            sym="${STATUSLINE_CURRENCY_SYMBOL}"
            extra_cap_left=$(echo "$usage_data" | jq -r '((.extra_usage.monthly_limit // 0) - (.extra_usage.used_credits // 0)) / 100' | awk '{printf "%.2f", $1}')

            extra_label="extra"
            { $five_on_extra || $seven_on_extra; } && extra_label="extra ⚡"
            seg="${white}${extra_label}${reset} ${extra_clr}${sym}${extra_used}/${sym}${extra_limit}${reset}"
            seg+=" ${dim}(${reset}${white}${sym}${extra_cap_left} left${reset}${dim})${reset}"
            append2 "$seg"
        fi
    fi
fi

# When rate-limited with no cached data, show a dim indicator instead of silence
# Only if at least one API section is enabled (otherwise out2 is empty by design)
if [ -z "$out2" ] && $ratelimited; then
    if [ "${STATUSLINE_SHOW_SESSION}" = "true" ] || [ "${STATUSLINE_SHOW_WEEKLY}" = "true" ] || [ "${STATUSLINE_SHOW_EXTRA}" = "true" ]; then
        append2 "${dim}limits unavailable (rate limited)${reset}"
    fi
fi

# ─── Render ──────────────────────────────────────────────────────────────────
if [ "${STATUSLINE_SPLIT_LINES}" = "true" ] && [ -n "$out2" ]; then
    printf "%b\n%b" "$out1" "$out2"
else
    [ -n "$out2" ] && out1+="${sep}${out2}"
    printf "%b" "$out1"
fi
exit 0
