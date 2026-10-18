#!/bin/bash

# ── Claude Code Statusline ────────────────────────────────────────────
# Version: 0.3.2
# Configurable statusline for Claude Code.
# Run `bash configure.sh` to customize which segments are displayed.
# Config: ~/.claude/statusline-config.json
#
# ── For AI agents ───────────────────────────────────────────────────
# If a user asks you (Claude) to change their statusline — add/remove/
# reorder segments — edit the config JSON below directly. Do NOT run
# `configure.sh` non-interactively: it's an arrow-key TUI wizard that
# reads raw keypresses and will hang waiting for terminal input.
#
# Config file: ~/.claude/statusline-config.json
#   (override path: $STATUSLINE_CONFIG_FILE)
#
# Schema (all fields optional; this example is also the built-in default):
#   {
#     "segments": ["timestamp","model","style","directory","git","context","cost","quota_5h","quota_7d"],
#     "context_bar_width": 20,
#     "bar_width": 10
#   }
#   - segments: ordered list of segment IDs below; order = left-to-right
#     display order. Unknown IDs are silently ignored.
#   - context_bar_width: width of the context-usage bar (default 20).
#   - bar_width: width of the quota bars (default 10).
#
# Valid segment IDs (id — description):
#   timestamp       — current time, e.g. [10:05:06]
#   model           — model display name, e.g. Sonnet 5
#   effort          — reasoning effort level, e.g. med
#   style           — output style, e.g. concise
#   directory       — current project directory name
#   git             — git branch + dirty/staged status
#   context         — context window usage bar + % + tokens left
#   context_pct     — context window usage, % + tokens left, no bar
#   cost            — API cost in USD (usage-based billing only, see below)
#   quota_5h        — 5-hour Pro/Max quota bar + % (subscription only, see below)
#   quota_7d        — 7-day Pro/Max quota bar + % (subscription only, see below)
#   quota_5h_pct    — 5-hour quota, % only, no bar (subscription only)
#   quota_7d_pct    — 7-day quota, % only, no bar (subscription only)
#   quota_5h_reset  — time until the 5-hour quota resets (subscription only)
#   quota_7d_reset  — time until the 7-day quota resets (subscription only)
#   duration        — total session wall-clock duration
#   api_duration    — total API call duration
#   lines           — lines added/removed this session
#   session         — session name
#   thinking        — whether extended thinking is on
#   version         — Claude Code version
#   pr              — pull request number + review state
#   tokens_in       — input tokens used
#   tokens_out      — output tokens used
#   tokens_cached   — cached tokens used
#   tokens_total    — total tokens used
#   cache_read      — prompt-cache read tokens + %
#   cache_write     — prompt-cache write tokens + %
#   vim_mode        — vim keybinding mode (NORMAL/INSERT/etc.)
#   worktree        — current git worktree name
#   flex            — spacer that pushes everything after it to the right edge
#   newline         — starts a new line in the statusline (repeatable)
#
# Behavior notes:
#   - Cost and Quota are mutually exclusive by account type, not by config:
#     `cost` only renders on usage-based/API billing and auto-hides on a
#     Pro/Max subscription; the `quota_*` segments only render on a
#     subscription. It's safe to enable both — whichever doesn't apply to
#     the account just stays hidden.
#   - Changes take effect on Claude Code's next prompt render; no restart
#     needed.

# Read JSON input from stdin
input=$(cat)

# ── Load configuration ────────────────────────────────────────────────
CONFIG_FILE="${STATUSLINE_CONFIG_FILE:-$HOME/.claude/statusline-config.json}"
DEFAULT_SEGMENTS='["timestamp","model","style","directory","git","context","cost","quota_5h","quota_7d"]'

if [[ -f "$CONFIG_FILE" ]]; then
    configured_segments=$(jq -r '.segments // empty' "$CONFIG_FILE" 2>/dev/null)
    bar_width=$(jq -r '.context_bar_width // 20' "$CONFIG_FILE" 2>/dev/null)
    quota_bar_width=$(jq -r '.bar_width // 10' "$CONFIG_FILE" 2>/dev/null)
fi
# Fall back to defaults
if [[ -z "$configured_segments" || "$configured_segments" == "null" ]]; then
    configured_segments="$DEFAULT_SEGMENTS"
fi
bar_width=${bar_width:-20}
quota_bar_width=${quota_bar_width:-10}

# ── Parse Input Data ──────────────────────────────────────────────────
# Extract all values in a single jq pass to maximize performance
eval $(echo "$input" | jq -r '
    @sh "J_MODEL=\(.model.display_name // "")",
    @sh "J_EFFORT=\(.effort.level // "")",
    @sh "J_STYLE=\(.output_style.name // "")",
    @sh "J_CUR_DIR=\(.workspace.current_dir // "")",
    @sh "J_PROJ_DIR=\(.workspace.project_dir // "")",
    @sh "J_USED_PCT=\(.context_window.used_percentage // "")",
    @sh "J_REM_PCT=\(.context_window.remaining_percentage // "")",
    @sh "J_CTX_SIZE=\(.context_window.context_window_size // 0)",
    @sh "J_OLD_CACHE_CREATE=\(.context_window.current_usage.cache_creation_input_tokens // 0)",
    @sh "J_OLD_CACHE_READ=\(.context_window.current_usage.cache_read_input_tokens // 0)",
    @sh "J_OLD_INPUT=\(.context_window.current_usage.input_tokens // 0)",
    @sh "J_COST=\(.cost.total_cost_usd // 0)",
    @sh "J_DUR_MS=\(.cost.total_duration_ms // 0)",
    @sh "J_LINES_ADD=\(.cost.total_lines_added // 0)",
    @sh "J_LINES_REM=\(.cost.total_lines_removed // 0)",
    @sh "J_SESS_NAME=\(.session_name // "")",
    @sh "J_THINKING=\(.thinking.enabled // "")",
    @sh "J_VERSION=\(.version // "")",
    @sh "J_PR_NUM=\(.pr.number // "")",
    @sh "J_PR_STATE=\(.pr.review_state // "")",
    @sh "J_QUOTA_5H_PCT=\(.rate_limits.five_hour.used_percentage // "")",
    @sh "J_QUOTA_7D_PCT=\(.rate_limits.seven_day.used_percentage // "")",
    @sh "J_TOK_IN=\(.context_window.total_input_tokens // "")",
    @sh "J_TOK_OUT=\(.context_window.total_output_tokens // "")",
    @sh "J_OLD_TOK_IN=\(.context_window.current_usage.input_tokens // "")",
    @sh "J_OLD_TOK_OUT=\(.context_window.current_usage.output_tokens // "")",
    @sh "J_OLD_TOK_CACHED_CREATE=\(.context_window.current_usage.cache_creation_input_tokens // "")",
    @sh "J_OLD_TOK_CACHED_READ=\(.context_window.current_usage.cache_read_input_tokens // "")",
    @sh "J_QUOTA_5H_RESET=\(.rate_limits.five_hour.resets_at // "")",
    @sh "J_QUOTA_7D_RESET=\(.rate_limits.seven_day.resets_at // "")",
    @sh "J_VIM_MODE=\(.vim.mode // "")",
    @sh "J_WORKTREE=\(.workspace.git_worktree // "")",
    @sh "J_API_DUR_MS=\(.cost.total_api_duration_ms // 0)"
')

# Fallbacks for older Claude Code payload format where total input/output might not be top-level
if [[ -z "$J_TOK_IN" || "$J_TOK_IN" == "null" ]]; then J_TOK_IN=$J_OLD_TOK_IN; fi
if [[ -z "$J_TOK_OUT" || "$J_TOK_OUT" == "null" ]]; then J_TOK_OUT=$J_OLD_TOK_OUT; fi

# Calculate cached
J_TOK_CACHED=$(( ${J_OLD_TOK_CACHED_CREATE:-0} + ${J_OLD_TOK_CACHED_READ:-0} ))

# ── Terminal Width ────────────────────────────────────────────────────

# Looks up $2's ppid/tty within the pre-fetched `ps -eo pid=,ppid=,tty=`
# snapshot passed as $1, setting PROC_PPID/PROC_TTY (empty if not found).
# Reading the snapshot in bash avoids shelling out to `ps` on every step of
# the ancestor walk below (up to 16 `ps -p` calls for an 8-level walk).
proc_lookup() {
    local table="$1" target="$2"
    PROC_PPID=""
    PROC_TTY=""
    local p pp t
    while read -r p pp t; do
        if [[ "$p" == "$target" ]]; then
            PROC_PPID="$pp"
            PROC_TTY="$t"
            return
        fi
    done <<< "$table"
}

get_terminal_width() {
    if [[ -n "$STATUSLINE_WIDTH" ]]; then echo "$STATUSLINE_WIDTH"; return; fi
    if [[ -n "$COLUMNS" && "$COLUMNS" =~ ^[0-9]+$ ]]; then echo "$COLUMNS"; return; fi
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then echo ""; return; fi

    local proc_table
    proc_table=$(ps -eo pid=,ppid=,tty= 2>/dev/null)

    local pid=$$
    local depth=0
    while [[ $depth -lt 8 ]]; do
        proc_lookup "$proc_table" "$pid"
        local parent_pid="$PROC_PPID"
        [[ -z "$parent_pid" ]] && break
        pid="$parent_pid"

        proc_lookup "$proc_table" "$pid"
        local tty="$PROC_TTY"
        if [[ -n "$tty" && "$tty" != "??" && "$tty" != "?" ]]; then
            local dev="/dev/$tty"
            # Try GNU stty's -F (Linux) then BSD stty's -f (macOS). Checking
            # $width directly (not the pipeline's exit status) matters here:
            # a failed stty piped into awk still exits 0 with empty output,
            # so testing the exit status alone would never fall through to
            # the second flag.
            local width=""
            width=$(stty -F "$dev" size 2>/dev/null | awk '{print $2}')
            [[ -z "$width" ]] && width=$(stty -f "$dev" size 2>/dev/null | awk '{print $2}')
            [[ -n "$width" ]] && echo "$width" && return
        fi
        depth=$((depth+1))
    done
    tput cols 2>/dev/null || echo ""
}

# ── Helpers ───────────────────────────────────────────────────────────

SEGMENT_ORDER=$(echo "$configured_segments" | jq -r '.[]')

is_enabled() {
    local s="$1"
    # Using space wrapping so we match exact segment names, preventing substring matches (e.g. "lines" matching "lines_added")
    [[ " $SEGMENT_ORDER " == *" $s "* ]]
}

build_bar() {
    local pct=$1 width=${2:-10}
    local filled=$((pct * width / 100))
    local empty=$((width - filled))
    local bar="["
    for ((i=0; i<filled; i++)); do bar="${bar}█"; done
    for ((i=0; i<empty; i++)); do bar="${bar}░"; done
    printf '%s]' "$bar"
}

pick_color() {
    local pct=$1
    if [[ $pct -lt 50 ]]; then printf '\033[32m'
    elif [[ $pct -lt 75 ]]; then printf '\033[33m'
    else printf '\033[31m'; fi
}

RST=$(printf '\033[0m')

format_tokens() {
    local count=$1
    if [[ -z "$count" || "$count" == "null" ]]; then echo ""; return; fi
    if [[ $count -lt 1000 ]]; then
        echo "$count"
    else
        local k=$((count / 1000))
        local d=$(((count % 1000) / 100))
        if [[ $d -eq 0 ]]; then
            echo "${k}k"
        else
            echo "${k}.${d}k"
        fi
    fi
}

strip_ansi() {
    printf '%s' "$1" | sed 's/\x1b\[[0-9;]*m//g'
}

# Auto-wraps an assembled line onto extra physical lines instead of
# truncating it, so enabling more segments than fit never silently hides
# any of them. Splits only at " | " segment separators (never inside a
# segment's own text or ANSI codes), so paired segments joined by a single
# space (directory+git, timestamp+model) always stay on the same line.
# Bash's ${#var} counts UTF-8 characters correctly under a UTF-8 locale
# (unlike the byte-oriented awk used for hard truncation elsewhere), so no
# multi-byte-aware scanning is needed here.
wrap_line() {
    local input="$1" max="$2"
    local chunks=()
    local remaining="$input"
    while [[ "$remaining" == *" | "* ]]; do
        chunks+=("${remaining%%" | "*}")
        remaining="${remaining#*" | "}"
    done
    chunks+=("$remaining")

    local phys_line="" phys_vlen=0
    local out_lines=()
    local chunk chunk_visible chunk_vlen
    for chunk in "${chunks[@]}"; do
        chunk_visible=$(strip_ansi "$chunk")
        chunk_vlen=${#chunk_visible}
        if [[ -z "$phys_line" ]]; then
            phys_line="$chunk"
            phys_vlen=$chunk_vlen
        elif [[ $((phys_vlen + 3 + chunk_vlen)) -le $max ]]; then
            phys_line="${phys_line} | ${chunk}"
            phys_vlen=$((phys_vlen + 3 + chunk_vlen))
        else
            out_lines+=("$phys_line")
            phys_line="$chunk"
            phys_vlen=$chunk_vlen
        fi
    done
    [[ -n "$phys_line" ]] && out_lines+=("$phys_line")
    printf '%s\n' "${out_lines[@]}"
}

# ── Segment renderers ─────────────────────────────────────────────────
# Each function prints its content (no leading/trailing pipe).
# The main loop adds separators between non-empty segments.

render_timestamp() {
    printf "$(printf '\033[36m')[%s]${RST}" "$(date +%H:%M:%S)"
}

render_model() {
    [[ -n "$J_MODEL" && "$J_MODEL" != "null" ]] && printf "$(printf '\033[34m')%s${RST}" "$J_MODEL"
}

render_effort() {
    [[ -n "$J_EFFORT" && "$J_EFFORT" != "null" ]] && printf "⚡%s" "$J_EFFORT"
}

render_style() {
    [[ -n "$J_STYLE" && "$J_STYLE" != "null" ]] && printf "$(printf '\033[33m')%s${RST}" "$J_STYLE"
}

render_directory() {
    local dir_display rel_path
    if [[ -n "$J_CUR_DIR" && "$J_CUR_DIR" != "null" ]]; then
        if [[ "$J_CUR_DIR" == "$J_PROJ_DIR"* ]] && [[ "$J_PROJ_DIR" != "null" ]] && [[ -n "$J_PROJ_DIR" ]]; then
            rel_path="${J_CUR_DIR#$J_PROJ_DIR}"
            if [[ -z "$rel_path" ]]; then
                dir_display="$(basename "$J_PROJ_DIR")"
            else
                dir_display="$(basename "$J_PROJ_DIR")$rel_path"
            fi
        else
            dir_display="$J_CUR_DIR"
        fi
        printf "$(printf '\033[32m')%s${RST}" "$dir_display"
    fi
}

render_git() {
    local branch git_status
    [[ -z "$J_CUR_DIR" || "$J_CUR_DIR" == "null" ]] && return
    git -C "$J_CUR_DIR" rev-parse --git-dir > /dev/null 2>&1 || return
    branch=$(git -C "$J_CUR_DIR" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null)
    [[ -z "$branch" ]] && return
    git_status=""
    git -C "$J_CUR_DIR" --no-optional-locks diff --quiet 2>/dev/null || git_status="${git_status}*"
    git -C "$J_CUR_DIR" --no-optional-locks diff --cached --quiet 2>/dev/null || git_status="${git_status}+"
    [[ -n $(git -C "$J_CUR_DIR" --no-optional-locks ls-files --others --exclude-standard 2>/dev/null) ]] && git_status="${git_status}?"
    printf "on $(printf '\033[35m')%s${RST}" "${branch}${git_status}"
}

render_context() {
    local pct remaining color bar size
    size=$J_CTX_SIZE
    if [[ -n "$J_USED_PCT" && "$J_USED_PCT" != "null" ]]; then
        pct=$(printf '%.0f' "$J_USED_PCT")
        [[ $pct -gt 100 ]] && pct=100
        color=$(pick_color "$pct")
        bar=$(build_bar "$pct" "$bar_width")
        if [[ -n "$J_REM_PCT" && "$J_REM_PCT" != "null" && "$size" != "0" && "$size" != "null" ]]; then
            remaining=$((size * ${J_REM_PCT%.*} / 100))
            if [[ "$remaining" -ge 1000 ]] 2>/dev/null; then
                printf "%s%s${RST} %s%% %sk left ctx" "$color" "$bar" "$pct" "$((remaining / 1000))"
                return
            fi
        fi
        printf "%s%s${RST} %s%% ctx" "$color" "$bar" "$pct"
    else
        local cache_total actual_tokens
        cache_total=$((J_OLD_CACHE_CREATE + J_OLD_CACHE_READ))
        if [[ $cache_total -gt 0 ]]; then actual_tokens=$cache_total
        else actual_tokens=$((J_OLD_INPUT + 53000)); fi
        [[ "$size" == "null" || "$size" -le 0 ]] 2>/dev/null && return
        pct=$((actual_tokens * 100 / size))
        [[ $pct -gt 100 ]] && pct=100
        remaining=$((size - actual_tokens))
        [[ $remaining -lt 0 ]] && remaining=0
        color=$(pick_color "$pct")
        bar=$(build_bar "$pct" "$bar_width")
        if [[ $remaining -ge 1000 ]]; then
            printf "%s%s${RST} %s%% %sk left ctx" "$color" "$bar" "$pct" "$((remaining / 1000))"
        else
            printf "%s%s${RST} %s%% ctx" "$color" "$bar" "$pct"
        fi
    fi
}

render_cost() {
    local cost_display
    # On a Pro/Max subscription Claude Code reports rate_limits, so the
    # API-style dollar cost isn't meaningful — hide it regardless of which
    # segments are enabled (Cost and Quota are mutually exclusive by design).
    if [[ -n "$J_QUOTA_5H_PCT" && "$J_QUOTA_5H_PCT" != "null" ]]; then return; fi
    if [[ -n "$J_QUOTA_7D_PCT" && "$J_QUOTA_7D_PCT" != "null" ]]; then return; fi
    [[ "$J_COST" == "0" || "$J_COST" == "null" ]] && return
    if (( $(echo "$J_COST < 0.01" | bc -l) )); then
        cost_display=$(printf "%.4f" "$J_COST")
    else
        cost_display=$(printf "%.2f" "$J_COST")
    fi
    printf "$(printf '\033[36m')\$%s${RST}" "$cost_display"
}

render_quota_5h() {
    local pct color bar
    [[ -z "$J_QUOTA_5H_PCT" || "$J_QUOTA_5H_PCT" == "null" ]] && return
    pct=$(printf '%.0f' "$J_QUOTA_5H_PCT")
    color=$(pick_color "$pct")
    bar=$(build_bar "$pct" "$quota_bar_width")
    printf "%s5h %s %s%%${RST}" "$color" "$bar" "$pct"
}

render_quota_7d() {
    local pct color bar
    [[ -z "$J_QUOTA_7D_PCT" || "$J_QUOTA_7D_PCT" == "null" ]] && return
    pct=$(printf '%.0f' "$J_QUOTA_7D_PCT")
    color=$(pick_color "$pct")
    bar=$(build_bar "$pct" "$quota_bar_width")
    printf "%s7d %s %s%%${RST}" "$color" "$bar" "$pct"
}

render_context_pct() {
    local pct remaining color size
    size=$J_CTX_SIZE
    if [[ -n "$J_USED_PCT" && "$J_USED_PCT" != "null" ]]; then
        pct=$(printf '%.0f' "$J_USED_PCT")
        [[ $pct -gt 100 ]] && pct=100
        color=$(pick_color "$pct")
        if [[ -n "$J_REM_PCT" && "$J_REM_PCT" != "null" && "$size" != "0" && "$size" != "null" ]]; then
            remaining=$((size * ${J_REM_PCT%.*} / 100))
            if [[ "$remaining" -ge 1000 ]] 2>/dev/null; then
                printf "Context: %s%s%% %sk left${RST}" "$color" "$pct" "$((remaining / 1000))"
                return
            fi
        fi
        printf "Context: %s%s%%${RST}" "$color" "$pct"
    else
        local cache_total actual_tokens
        cache_total=$((J_OLD_CACHE_CREATE + J_OLD_CACHE_READ))
        if [[ $cache_total -gt 0 ]]; then actual_tokens=$cache_total
        else actual_tokens=$((J_OLD_INPUT + 53000)); fi
        [[ "$size" == "null" || "$size" -le 0 ]] 2>/dev/null && return
        pct=$((actual_tokens * 100 / size))
        [[ $pct -gt 100 ]] && pct=100
        remaining=$((size - actual_tokens))
        [[ $remaining -lt 0 ]] && remaining=0
        color=$(pick_color "$pct")
        if [[ $remaining -ge 1000 ]]; then
            printf "Context: %s%s%% %sk left${RST}" "$color" "$pct" "$((remaining / 1000))"
        else
            printf "Context: %s%s%%${RST}" "$color" "$pct"
        fi
    fi
}

render_quota_5h_pct() {
    local pct color
    [[ -z "$J_QUOTA_5H_PCT" || "$J_QUOTA_5H_PCT" == "null" ]] && return
    pct=$(printf '%.0f' "$J_QUOTA_5H_PCT")
    color=$(pick_color "$pct")
    printf "%s5h %s%%${RST}" "$color" "$pct"
}

render_quota_7d_pct() {
    local pct color
    [[ -z "$J_QUOTA_7D_PCT" || "$J_QUOTA_7D_PCT" == "null" ]] && return
    pct=$(printf '%.0f' "$J_QUOTA_7D_PCT")
    color=$(pick_color "$pct")
    printf "%s7d %s%%${RST}" "$color" "$pct"
}

render_duration() {
    local sec
    [[ -z "$J_DUR_MS" || "$J_DUR_MS" == "null" || "$J_DUR_MS" == "0" ]] && return
    sec=$((J_DUR_MS / 1000))
    if [[ $sec -ge 3600 ]]; then
        printf "⏱ %dh%dm" "$((sec/3600))" "$(((sec%3600)/60))"
    elif [[ $sec -ge 60 ]]; then
        printf "⏱ %dm%ds" "$((sec/60))" "$((sec%60))"
    else
        printf "⏱ %ds" "$sec"
    fi
}

render_lines() {
    [[ "$J_LINES_ADD" == "0" && "$J_LINES_REM" == "0" ]] && return
    printf "$(printf '\033[32m')+%s${RST}/$(printf '\033[31m')-%s${RST}" "$J_LINES_ADD" "$J_LINES_REM"
}

render_session() {
    [[ -n "$J_SESS_NAME" && "$J_SESS_NAME" != "null" ]] && printf "📌 %s" "$J_SESS_NAME"
}

render_thinking() {
    [[ "$J_THINKING" == "true" ]] && printf "💭 on"
}

render_version() {
    [[ -n "$J_VERSION" && "$J_VERSION" != "null" ]] && printf "v%s" "$J_VERSION"
}

render_pr() {
    [[ -z "$J_PR_NUM" || "$J_PR_NUM" == "null" ]] && return
    case "$J_PR_STATE" in
        approved) printf "PR #%s $(printf '\033[32m')✓${RST}" "$J_PR_NUM" ;;
        changes_requested) printf "PR #%s $(printf '\033[31m')✗${RST}" "$J_PR_NUM" ;;
        draft) printf "PR #%s $(printf '\033[90m')draft${RST}" "$J_PR_NUM" ;;
        *) printf "PR #%s" "$J_PR_NUM" ;;
    esac
}

render_tokens_in() {
    local fmt; fmt=$(format_tokens "$J_TOK_IN")
    [[ -n "$fmt" ]] && printf "In: %s" "$fmt"
}

render_tokens_out() {
    local fmt; fmt=$(format_tokens "$J_TOK_OUT")
    [[ -n "$fmt" ]] && printf "Out: %s" "$fmt"
}

render_tokens_cached() {
    local fmt; fmt=$(format_tokens "$J_TOK_CACHED")
    [[ -n "$fmt" && "$J_TOK_CACHED" -gt 0 ]] && printf "Cache: %s" "$fmt"
}

render_tokens_total() {
    local total; total=$(( ${J_TOK_IN:-0} + ${J_TOK_OUT:-0} ))
    local fmt; fmt=$(format_tokens "$total")
    [[ -n "$fmt" && "$total" -gt 0 ]] && printf "Tok: %s" "$fmt"
}

render_cache_read() {
    local read=$J_OLD_CACHE_READ create=$J_OLD_CACHE_CREATE input=$J_OLD_INPUT
    [[ -z "$read" || "$read" -le 0 ]] 2>/dev/null && return
    local fmt; fmt=$(format_tokens "$read")
    local denom=$((read + create + input))
    if [[ $denom -gt 0 ]]; then
        local pct; pct=$(awk -v r="$read" -v d="$denom" 'BEGIN{printf "%.0f", (r/d)*100}')
        printf "Cache Read: %s (%s%%)" "$fmt" "$pct"
    else
        printf "Cache Read: %s" "$fmt"
    fi
}

render_cache_write() {
    local read=$J_OLD_CACHE_READ create=$J_OLD_CACHE_CREATE input=$J_OLD_INPUT
    [[ -z "$create" || "$create" -le 0 ]] 2>/dev/null && return
    local fmt; fmt=$(format_tokens "$create")
    local denom=$((read + create + input))
    if [[ $denom -gt 0 ]]; then
        local pct; pct=$(awk -v c="$create" -v d="$denom" 'BEGIN{printf "%.0f", (c/d)*100}')
        printf "Cache Write: %s (%s%%)" "$fmt" "$pct"
    else
        printf "Cache Write: %s" "$fmt"
    fi
}

format_countdown() {
    local delta=$1
    [[ $delta -lt 0 ]] && delta=0
    local days=$((delta / 86400))
    local hours=$(((delta % 86400) / 3600))
    local mins=$(((delta % 3600) / 60))
    if [[ $days -gt 0 ]]; then
        printf "%dd%dh" "$days" "$hours"
    elif [[ $hours -gt 0 ]]; then
        printf "%dh%dm" "$hours" "$mins"
    else
        printf "%dm" "$mins"
    fi
}

render_quota_5h_reset() {
    [[ -z "$J_QUOTA_5H_RESET" || "$J_QUOTA_5H_RESET" == "null" ]] && return
    local now delta
    now=$(date +%s)
    delta=$(( ${J_QUOTA_5H_RESET%.*} - now ))
    printf "⏳ resets in %s" "$(format_countdown "$delta")"
}

render_quota_7d_reset() {
    [[ -z "$J_QUOTA_7D_RESET" || "$J_QUOTA_7D_RESET" == "null" ]] && return
    local now delta
    now=$(date +%s)
    delta=$(( ${J_QUOTA_7D_RESET%.*} - now ))
    printf "⏳ resets in %s" "$(format_countdown "$delta")"
}

render_vim_mode() {
    [[ -z "$J_VIM_MODE" || "$J_VIM_MODE" == "null" ]] && return
    printf "🔵 %s" "$J_VIM_MODE"
}

render_worktree() {
    [[ -z "$J_WORKTREE" || "$J_WORKTREE" == "null" ]] && return
    printf "🌳 %s" "$J_WORKTREE"
}

render_api_duration() {
    local sec
    [[ -z "$J_API_DUR_MS" || "$J_API_DUR_MS" == "null" || "$J_API_DUR_MS" == "0" ]] && return
    sec=$((J_API_DUR_MS / 1000))
    if [[ $sec -ge 3600 ]]; then
        printf "⏱ api %dh%dm" "$((sec/3600))" "$(((sec%3600)/60))"
    elif [[ $sec -ge 60 ]]; then
        printf "⏱ api %dm%ds" "$((sec/60))" "$((sec%60))"
    else
        printf "⏱ api %ds" "$sec"
    fi
}

# ── Main render loop ──────────────────────────────────────────────────

TERM_WIDTH=$(get_terminal_width)
# Claude Code applies some left margin to the statusline (typically ~6 spaces).
TERM_LEFT_MARGIN=6

# Split into lines by "newline" marker
declare -a lines_arr
current_line=""
for seg in $SEGMENT_ORDER; do
    if [[ "$seg" == "newline" ]]; then
        lines_arr+=("$current_line")
        current_line=""
    else
        current_line="$current_line $seg"
    fi
done
lines_arr+=("$current_line")

for line_segs in "${lines_arr[@]}"; do
    line_out=""
    first_in_group=true
    flex_count=0
    prev_seg=""
    
    for seg in $line_segs; do
        output=""
        case "$seg" in
            flex)        output="__FLEX__"; flex_count=$((flex_count+1)) ;;
            timestamp)   output=$(render_timestamp) ;;
            model)       output=$(render_model) ;;
            effort)      output=$(render_effort) ;;
            style)       output=$(render_style) ;;
            directory)   output=$(render_directory) ;;
            git)         output=$(render_git) ;;
            context)     output=$(render_context) ;;
            context_pct) output=$(render_context_pct) ;;
            cost)        output=$(render_cost) ;;
            quota_5h)    output=$(render_quota_5h) ;;
            quota_5h_pct) output=$(render_quota_5h_pct) ;;
            quota_7d)    output=$(render_quota_7d) ;;
            quota_7d_pct) output=$(render_quota_7d_pct) ;;
            duration)    output=$(render_duration) ;;
            lines)       output=$(render_lines) ;;
            session)     output=$(render_session) ;;
            thinking)    output=$(render_thinking) ;;
            version)     output=$(render_version) ;;
            pr)          output=$(render_pr) ;;
            tokens_in)   output=$(render_tokens_in) ;;
            tokens_out)  output=$(render_tokens_out) ;;
            tokens_cached) output=$(render_tokens_cached) ;;
            tokens_total) output=$(render_tokens_total) ;;
            cache_read) output=$(render_cache_read) ;;
            cache_write) output=$(render_cache_write) ;;
            quota_5h_reset) output=$(render_quota_5h_reset) ;;
            quota_7d_reset) output=$(render_quota_7d_reset) ;;
            vim_mode) output=$(render_vim_mode) ;;
            worktree) output=$(render_worktree) ;;
            api_duration) output=$(render_api_duration) ;;
        esac

        if [[ -n "$output" ]]; then
            if [[ "$output" == "__FLEX__" ]]; then
                line_out="${line_out}__FLEX__"
                first_in_group=true
            elif $first_in_group; then
                line_out="${line_out}${output}"
                first_in_group=false
            else
                # Special cases: git follows directory, model follows timestamp
                if [[ "$seg" == "git" && "$prev_seg" == "directory" ]]; then
                    line_out="${line_out} ${output}"
                elif [[ "$seg" == "model" && "$prev_seg" == "timestamp" ]]; then
                    line_out="${line_out} ${output}"
                else
                    line_out="${line_out} | ${output}"
                fi
            fi
            prev_seg="$seg"
        fi
    done

    # If line is empty, skip
    [[ -z "$line_out" ]] && continue

    # Resolve flex spaces if any
    if [[ $flex_count -gt 0 ]]; then
        if [[ -n "$TERM_WIDTH" && "$TERM_WIDTH" -gt 0 ]]; then
            # visible length
            visible_text=$(strip_ansi "$line_out" | sed 's/__FLEX__//g')
            vlen=${#visible_text}

            available=$((TERM_WIDTH - vlen - TERM_LEFT_MARGIN))
            [[ $available -lt 0 ]] && available=0
            
            line_out=$(echo -n "$line_out" | awk -v total="$available" -v count="$flex_count" '
            BEGIN {
               sp_per = int(total / count)
               rem = total % count
            }
            {
               res = ""
               while ((i = index($0, "__FLEX__")) > 0) {
                  curr_spaces = sp_per + (rem > 0 ? 1 : 0)
                  if (rem > 0) rem--
                  sp_str = ""
                  for(j=0; j<curr_spaces; j++) sp_str = sp_str " "
                  
                  res = res substr($0, 1, i-1) sp_str
                  $0 = substr($0, i+8)
               }
               res = res $0
               printf "%s", res
            }')
        else
            # unknown width, just convert flex to single space
            line_out="${line_out//__FLEX__/ }"
        fi
    fi

    # If the line overflows the terminal width, either wrap it onto extra
    # physical lines (the common case) or truncate it with "..." (only when
    # this line uses flex — flex already claims the whole line's width to
    # distribute space around its markers, which doesn't compose with
    # wrapping onto multiple lines).
    physical_lines=("$line_out")
    if [[ -n "$TERM_WIDTH" && "$TERM_WIDTH" -gt 0 ]]; then
        visible_text=$(strip_ansi "$line_out")
        vlen=${#visible_text}
        max_len=$((TERM_WIDTH - TERM_LEFT_MARGIN))

        if [[ $vlen -gt $max_len && $max_len -gt 3 ]]; then
            if [[ $flex_count -gt 0 ]]; then
                # Truncate using awk to handle ANSI codes and multi-byte UTF-8
                # characters (block-drawing bars, emoji) properly. LC_ALL=C forces
                # byte-oriented string handling so awk never attempts locale-aware
                # multibyte decoding (which can abort mid-sequence on some awk
                # builds); UTF-8 lead-byte ranges are classified explicitly so a
                # multi-byte character is always counted and copied as one unit,
                # never split across the truncation boundary.
                line_out=$(echo -n "$line_out" | LC_ALL=C awk -v max="$((max_len - 3))" '
                BEGIN {
                    lead2 = sprintf("%c", 194); lead3 = sprintf("%c", 224)
                    lead4 = sprintf("%c", 240); leadmax = sprintf("%c", 245)
                }
                {
                    ansi = 0
                    len = 0
                    out = ""
                    n = length($0)
                    i = 1
                    while (i <= n) {
                        c = substr($0, i, 1)
                        if (ansi == 1) {
                            out = out c
                            if (c == "m") ansi = 0
                            i++
                            continue
                        }
                        if (c == "\033") {
                            ansi = 1
                            out = out c
                            i++
                            continue
                        }
                        seqlen = 1
                        if (c >= lead4 && c < leadmax) seqlen = 4
                        else if (c >= lead3 && c < lead4) seqlen = 3
                        else if (c >= lead2 && c < lead3) seqlen = 2
                        len++
                        if (len > max) {
                            out = out "..."
                            break
                        }
                        out = out substr($0, i, seqlen)
                        i += seqlen
                    }
                    print out "\033[0m"
                }')
                physical_lines=("$line_out")
            else
                physical_lines=()
                while IFS= read -r wrapped_line; do
                    physical_lines+=("$wrapped_line")
                done < <(wrap_line "$line_out" "$max_len")
            fi
        fi
    fi

    # Print each physical line with reset prefix and non-breaking spaces
    # (awk replaces all regular spaces with \xc2\xa0, UTF-8 non-breaking space)
    for line_out in "${physical_lines[@]}"; do
        line_out=$(echo -n "$line_out" | awk '{gsub(/ /, "\xc2\xa0"); print}')
        printf "\033[0m%s\n" "$line_out"
    done
done
