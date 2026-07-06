#!/bin/bash

# Claude Code Status Line — Two-line layout with Nerd Font icons (MD range)
# Line 1: Model │ Context Bar (16 segs) │ Cost │ 5h usage │ 7d usage
# Line 2: Directory │ Git Branch & Status │ Venv │ Vim

input=$(< /dev/stdin)
now=$(date +%s)

# --- Extract all values in a single jq call ---
eval "$(jq -r '
    @sh "model=\(.model.display_name // "?")",
    @sh "cwd=\(.workspace.current_dir // ".")",
    @sh "used_pct=\(.context_window.used_percentage // 0)",
    @sh "cost=\(.cost.total_cost_usd // 0)",
    @sh "vim_mode=\(.vim.mode // "")"
' <<< "$input")"

dir_name="${cwd##*/}"

# --- Theme detection ---
# Override with STATUSLINE_THEME=dark|light|auto (default: auto)
detect_theme() {
    local theme="${STATUSLINE_THEME:-auto}"
    if [ "$theme" != "auto" ]; then echo "$theme"; return; fi

    # macOS system appearance
    if defaults read -g AppleInterfaceStyle &>/dev/null; then
        echo "dark"; return
    fi

    # COLORFGBG env var (e.g. "15;0" → bg=0 is dark)
    if [ -n "$COLORFGBG" ]; then
        local bg="${COLORFGBG##*;}"
        if [ "$bg" -lt 8 ] 2>/dev/null; then
            echo "dark"
        else
            echo "light"
        fi
        return
    fi

    echo "dark"
}

THEME=$(detect_theme)

# --- Colors ---
RST=$'\033[0m'
BOLD=$'\033[1m'

if [ "$THEME" = "light" ]; then
    DIM=$'\033[90m'              # bright black (gray) — visible on light bg
    CYAN=$'\033[36m'
    GREEN=$'\033[32m'
    YELLOW=$'\033[33m'
    RED=$'\033[31m'
    MAGENTA=$'\033[35m'
    BLUE=$'\033[34m'
    BG_RED=$'\033[41m'
    WHITE_BOLD=$'\033[1;30m'     # bold black — for alert badge text on light bg
else
    DIM=$'\033[2m'
    CYAN=$'\033[36m'
    GREEN=$'\033[32m'
    YELLOW=$'\033[33m'
    RED=$'\033[31m'
    MAGENTA=$'\033[35m'
    BLUE=$'\033[34m'
    BG_RED=$'\033[41m'
    WHITE_BOLD=$'\033[1;37m'
fi

# --- Nerd Font Icons (all MD range, U+F0000+) ---
ICON_MODEL="󰚩"     # nf-md-robot
ICON_CTX="󰍛"       # nf-md-memory
ICON_DIR="󰝰"       # nf-md-folder_outline
ICON_GIT="󰘬"       # nf-md-source_branch
ICON_COST="󰄉"      # nf-md-cash
ICON_WARN=""       # nf-fa-warning
ICON_VIM="󰕷"       # nf-md-vim
ICON_VENV="󰌠"      # nf-md-language_python

SEP="${DIM} │ ${RST}"
BAR_SEGMENTS=16

# --- Color helper for utilization percentage ---
# Thresholds: green < 50, yellow 50-79, red >= 80
pct_color() {
    local pct=$1
    if [ "$pct" -lt 50 ]; then echo "$GREEN"
    elif [ "$pct" -lt 80 ]; then echo "$YELLOW"
    else echo "$RED"
    fi
}

# --- Context percentage ---
pct_int=${used_pct%.*}
pct_int=${pct_int:-0}
CTX_COLOR=$(pct_color "$pct_int")

# --- Progress bar ---
filled=$(( (pct_int * BAR_SEGMENTS + 50) / 100 ))
[ "$filled" -gt "$BAR_SEGMENTS" ] && filled=$BAR_SEGMENTS
empty=$((BAR_SEGMENTS - filled))
bar=""
for ((i = 0; i < filled; i++)); do bar="${bar}▰"; done
for ((i = 0; i < empty; i++)); do bar="${bar}▱"; done

# --- Cost ---
printf -v cost_str '$%.2f' "$cost"

# --- Git info (single git status --porcelain call) ---
git_info=""
if git -C "$cwd" rev-parse --git-dir > /dev/null 2>&1; then
    branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
    [ -z "$branch" ] && branch="detached"

    staged=0 unstaged=0 untracked=0
    while IFS= read -r line; do
        x=${line:0:1}
        y=${line:1:1}
        if [ "$x$y" = "??" ]; then
            ((untracked++))
        else
            [ "$x" != " " ] && [ "$x" != "?" ] && ((staged++))
            [ "$y" != " " ] && ((unstaged++))
        fi
    done < <(git -C "$cwd" status --porcelain 2>/dev/null)

    status=""
    [ "$staged" -gt 0 ] && status="${status} ${GREEN}+${staged}${RST}"
    [ "$unstaged" -gt 0 ] && status="${status} ${YELLOW}~${unstaged}${RST}"
    [ "$untracked" -gt 0 ] && status="${status} ${DIM}?${untracked}${RST}"

    git_info="${SEP}${MAGENTA}${ICON_GIT} ${branch}${RST}${status}"
fi

# --- Python venv detection ---
venv_str=""
venv_name="" py_ver=""
if [ -n "$VIRTUAL_ENV" ]; then
    venv_name="${VIRTUAL_ENV##*/}"
else
    for venv_dir in "$cwd/.venv" "$cwd/venv" "$cwd/.env"; do
        if [ -f "${venv_dir}/bin/python" ]; then
            venv_name="${venv_dir##*/}"
            py_ver=$("${venv_dir}/bin/python" --version 2>/dev/null | awk '{print $2}' | cut -d. -f1-2)
            break
        fi
    done
fi
if [ -n "$venv_name" ]; then
    venv_str="${SEP}${YELLOW}${ICON_VENV} ${venv_name}${py_ver:+ ($py_ver)}${RST}"
fi

# --- Vim mode ---
vim_str=""
if [ -n "$vim_mode" ]; then
    [[ "$vim_mode" == "NORMAL" ]] && vim_color=$BLUE || vim_color=$GREEN
    vim_str="${SEP}${vim_color}${BOLD}${ICON_VIM} ${vim_mode}${RST}"
fi

# --- Anthropic OAuth usage API (cached, background refresh) ---
CACHE_DIR="$HOME/.claude/statusline-cache"
USAGE_CACHE="$CACHE_DIR/usage.dat"
LOCK_FILE="$CACHE_DIR/usage-update.lock"
CACHE_TTL=60

refresh_usage_cache() {
    if ! mkdir "$LOCK_FILE" 2>/dev/null; then
        lock_age=$(( now - $(stat -f%m "$LOCK_FILE" 2>/dev/null || echo 0) ))
        [ "$lock_age" -gt 60 ] && rm -r "$LOCK_FILE" 2>/dev/null || return
        mkdir "$LOCK_FILE" 2>/dev/null || return
    fi
    (
        # Try macOS Keychain first, then fall back to credentials file
        token=$(security find-generic-password -s "Claude Code-credentials" -a "$(whoami)" -w 2>/dev/null | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null)
        [ -z "$token" ] && token=$(jq -r '.claudeAiOauth.accessToken // empty' "$HOME/.claude/.credentials.json" 2>/dev/null)
        if [ -n "$token" ]; then
            resp=$(curl -s --max-time 5 \
                -H "Authorization: Bearer $token" \
                -H "anthropic-beta: oauth-2025-04-20" \
                https://api.anthropic.com/api/oauth/usage 2>/dev/null)
            if echo "$resp" | jq -e '.five_hour' > /dev/null 2>&1; then
                echo "$resp" | jq -r '
                    def to_epoch: split(".")[0] + "Z" | fromdateiso8601;
                    "\(.five_hour.utilization | floor) \(.five_hour.resets_at | to_epoch) \(.seven_day.utilization | floor) \(.seven_day.resets_at | to_epoch)"
                ' > "$USAGE_CACHE.tmp" 2>/dev/null && mv "$USAGE_CACHE.tmp" "$USAGE_CACHE"
            fi
        fi
        rm -r "$LOCK_FILE" 2>/dev/null
    ) &
    disown 2>/dev/null
}

format_countdown() {
    local diff=$(( $1 - now ))
    [ "$diff" -le 0 ] && echo "soon" && return
    if [ "$diff" -ge 86400 ]; then
        echo "$((diff / 86400))d$((diff % 86400 / 3600))h"
    elif [ "$diff" -ge 3600 ]; then
        echo "$((diff / 3600))h$((diff % 3600 / 60))m"
    else
        echo "$((diff / 60))m"
    fi
}

usage_segment() {
    local label=$1 pct=$2 reset_epoch=$3
    local color reset_str
    color=$(pct_color "$pct")
    reset_str=$(format_countdown "$reset_epoch")
    echo "${SEP}${DIM}${label}${RST} ${color}${pct}%${RST} ${DIM}↺ ${reset_str}${RST}"
}

if [ ! -f "$USAGE_CACHE" ]; then
    [ -d "$CACHE_DIR" ] || mkdir -p "$CACHE_DIR" 2>/dev/null
    refresh_usage_cache
else
    cache_age=$(( now - $(stat -f%m "$USAGE_CACHE" 2>/dev/null || echo 0) ))
    [ "$cache_age" -gt "$CACHE_TTL" ] && refresh_usage_cache
fi

usage_5h="" usage_7d=""
if [ -f "$USAGE_CACHE" ]; then
    read -r pct5h epoch5h pct7d epoch7d < "$USAGE_CACHE" 2>/dev/null
    if [ -n "$pct5h" ] && [ "$pct5h" != "-1" ]; then
        usage_5h=$(usage_segment "5h" "$pct5h" "$epoch5h")
    fi
    if [ -n "$pct7d" ] && [ "$pct7d" != "-1" ]; then
        usage_7d=$(usage_segment "7d" "$pct7d" "$epoch7d")
    fi
fi

# --- Build output ---
line1_tail="${SEP}${DIM}${ICON_COST} ${cost_str}${RST}${usage_5h}${usage_7d}"

if [ "$pct_int" -ge 90 ]; then
    line1="${BG_RED}${WHITE_BOLD} ${ICON_WARN} CTX ${pct_int}% ${RST} ${CYAN}${BOLD}${ICON_MODEL} ${model}${RST}${SEP}${CTX_COLOR}${bar}${RST}${line1_tail}"
else
    line1="${CYAN}${BOLD}${ICON_MODEL} ${model}${RST}${SEP}${DIM}${ICON_CTX}${RST} ${CTX_COLOR}${bar} ${pct_int}%${RST}${line1_tail}"
fi

line2="${BLUE}${ICON_DIR} ${dir_name}${RST}${git_info}${venv_str}${vim_str}"

printf '%s\n%s' "$line1" "$line2"
