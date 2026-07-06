#!/bin/bash
# [statuslin.es] trimmed: removed the ccusage-cache.sh sibling-script call and its daily-cost table; everything else is unmodified from the pinned source.
# Claude Code Custom Statusline
# https://github.com/JungHoonGhae/claude-statusline
#
# A rich statusline for Claude Code that shows context usage, rate limits,
# tool/agent activity, and daily token costs — all in pure bash.
#
# Dependencies: jq, curl
# Optional: ccusage (npm) for token cost tracking

# ── Platform Detection ────────────────────────────────────────────────────────
OS_TYPE="$(uname -s)"

get_mtime() {
  case "$OS_TYPE" in
    Darwin) stat -f %m "$1" 2>/dev/null || echo 0 ;;
    MINGW*|MSYS*|CYGWIN*) stat -c %Y "$1" 2>/dev/null || echo 0 ;;
    *) stat -c %Y "$1" 2>/dev/null || echo 0 ;;
  esac
}

parse_iso_to_epoch() {
  local ts=$1
  case "$OS_TYPE" in
    Darwin) TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%S" "$ts" "+%s" 2>/dev/null ;;
    *) TZ=UTC date -d "${ts}" "+%s" 2>/dev/null ;;
  esac
}

get_oauth_token() {
  local cred_file
  case "$OS_TYPE" in
    Darwin)
      security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null \
        | jq -r '.claudeAiOauth.accessToken // empty'
      return
      ;;
    MINGW*|MSYS*|CYGWIN*)
      # Windows (Git Bash / MSYS2 / Cygwin): ~/.claude/.credentials.json
      cred_file="$HOME/.claude/.credentials.json"
      if [ ! -f "$cred_file" ] && [ -n "$APPDATA" ]; then
        cred_file="$APPDATA/Claude/credentials.json"
      fi
      if [ -f "$cred_file" ]; then
        jq -r '.claudeAiOauth.accessToken // empty' "$cred_file" 2>/dev/null
      fi
      return
      ;;
  esac
  # Linux: try credentials file, then secret-tool (GNOME Keyring)
  cred_file="$HOME/.claude/.credentials.json"
  if [ -f "$cred_file" ]; then
    jq -r '.claudeAiOauth.accessToken // empty' "$cred_file" 2>/dev/null
  elif command -v secret-tool >/dev/null 2>&1; then
    secret-tool lookup service "Claude Code-credentials" 2>/dev/null \
      | jq -r '.claudeAiOauth.accessToken // empty' 2>/dev/null
  fi
}

# ── Dependency Check ──────────────────────────────────────────────────────────
# Without this, a missing jq makes the statusline silently blank (common in
# Docker containers after restart — only the mounted ~/.claude survives)
if ! command -v jq >/dev/null 2>&1; then
  cat > /dev/null
  printf '\n  \033[1;31mclaude-statusline: jq not found\033[0m \033[2m— install it: apt-get install -y jq / apk add jq / brew install jq\033[0m\n\n'
  exit 0
fi

# ── Cache ─────────────────────────────────────────────────────────────────────
# Per-user dir — a shared /tmp path collides (and leaks data) between users
CACHE_DIR="${TMPDIR:-/tmp}/claude-statusline-$(id -u)"
mkdir -p "$CACHE_DIR" 2>/dev/null

# ── Configuration ─────────────────────────────────────────────────────────────
# Defaults; overridable by environment, then by the conf file (conf wins).
SHOW_RATE_LIMITS=${SHOW_RATE_LIMITS:-true}
SHOW_TOOLS=${SHOW_TOOLS:-true}
SHOW_AGENTS=${SHOW_AGENTS:-true}
SHOW_CCUSAGE=${SHOW_CCUSAGE:-true}
SHOW_CONTEXT_BAR=${SHOW_CONTEXT_BAR:-true}
SHOW_BURN_RATE=${SHOW_BURN_RATE:-true}
SHOW_GIT_AHEAD=${SHOW_GIT_AHEAD:-true}
SHOW_LINKS=${SHOW_LINKS:-true}
SHOW_SESSION_NAME=${SHOW_SESSION_NAME:-false}
CONTEXT_WARN_PCT=${CONTEXT_WARN_PCT:-30}
CONTEXT_CRIT_PCT=${CONTEXT_CRIT_PCT:-70}
DAILY_BUDGET=${DAILY_BUDGET:-0}

STATUSLINE_CONF="${STATUSLINE_CONF:-$HOME/.claude/statusline.conf}"
if [ -f "$STATUSLINE_CONF" ]; then
  while IFS='=' read -r key val; do
    key=$(echo "$key" | tr -d '[:space:]')
    val=$(echo "$val" | tr -d '[:space:]')
    case "$key" in
      SHOW_RATE_LIMITS|SHOW_TOOLS|SHOW_AGENTS|SHOW_CCUSAGE) eval "$key=$val" ;;
      SHOW_CONTEXT_BAR|SHOW_BURN_RATE|SHOW_GIT_AHEAD|SHOW_LINKS|SHOW_SESSION_NAME) eval "$key=$val" ;;
      CONTEXT_WARN_PCT|CONTEXT_CRIT_PCT|DAILY_BUDGET) eval "$key=$val" ;;
    esac
  done < <(grep -v '^\s*#' "$STATUSLINE_CONF" | grep -v '^\s*$')
fi

# Terminal width — Claude Code exports $COLUMNS. The header and the rate-limit
# lines compact at *independent* thresholds (the header is far longer, so it
# needs to shrink well before the rate-limit lines do — otherwise the gauges get
# packed together while there's still plenty of room).
#   WIDE      (>= WIDE_COLS):     full header incl. ctx bar, token detail, burn rate
#   medium:                       standard header, no extras
#   COMPACT   (<  COMPACT_COLS):  minimal header (model | ctx% | project | cost)
#   RL_COMPACT(<  RLCOMPACT_COLS):tight rate-limit lines (5 spaced dots, no labels)
# COLUMNS unset (0) → assume wide so piped/test use keeps the full layout.
COLS=${COLUMNS:-0}
COMPACT_COLS=100   # minimal header below this (standard header needs ~96 cols)
WIDE_COLS=132      # ctx bar + tokens + burn rate above this (full header ~129 cols)
RLCOMPACT_COLS=64  # tighten rate-limit lines only below this (normal line ~56 cols)
COMPACT=0
WIDE=1
RL_COMPACT=0
if [ "$COLS" -gt 0 ] 2>/dev/null; then
  [ "$COLS" -lt "$COMPACT_COLS" ] && COMPACT=1
  [ "$COLS" -lt "$WIDE_COLS" ] && WIDE=0
  [ "$COLS" -lt "$RLCOMPACT_COLS" ] && RL_COMPACT=1
fi
# Links can leak escape codes through tmux without passthrough — disable there
[ -n "$TMUX" ] && SHOW_LINKS=false

# ── Parse stdin from Claude Code ──────────────────────────────────────────────
input=$(cat)

eval "$(jq -r '
  @sh "model=\(.model.display_name // "Unknown")",
  @sh "used=\(.context_window.used_percentage // 0 | floor)",
  @sh "ctx_size=\(.context_window.context_window_size // 0)",
  @sh "ctx_tokens=\(if .context_window.current_usage then ((.context_window.current_usage.input_tokens // 0) + (.context_window.current_usage.cache_creation_input_tokens // 0) + (.context_window.current_usage.cache_read_input_tokens // 0)) else "" end)",
  @sh "cwd=\(.workspace.current_dir // .cwd // "")",
  @sh "cost=\(.cost.total_cost_usd // 0)",
  @sh "duration_ms=\(.cost.total_duration_ms // 0)",
  @sh "lines_added=\(.cost.total_lines_added // 0)",
  @sh "lines_removed=\(.cost.total_lines_removed // 0)",
  @sh "git_branch=\(.git.branch // "")",
  @sh "git_dirty=\(.git.dirty // false)",
  @sh "worktree=\(.worktree.name // .workspace.git_worktree // "")",
  @sh "fast_mode=\(.fast_mode // false)",
  @sh "effort=\(.effort.level // "")",
  @sh "thinking=\(.thinking.enabled // false)",
  @sh "pr_number=\(.pr.number // "")",
  @sh "pr_state=\(.pr.review_state // "")",
  @sh "pr_url=\(.pr.url // "")",
  @sh "session_name=\(.session_name // "")",
  @sh "transcript_path=\(.transcript_path // "")",
  @sh "stdin_5h_used=\(.rate_limits.five_hour.used_percentage // "")",
  @sh "stdin_5h_reset=\(.rate_limits.five_hour.resets_at // "")",
  @sh "stdin_7d_used=\(.rate_limits.seven_day.used_percentage // "")",
  @sh "stdin_7d_reset=\(.rate_limits.seven_day.resets_at // "")"
' <<< "$input")"

# ── Project & Branch ──────────────────────────────────────────────────────────
project=$(basename "$cwd" 2>/dev/null)

# Claude Code no longer sends .git in stdin (v2.1.x) — read from the repo directly
if [ -z "$git_branch" ] && [ -n "$cwd" ] && [ -d "$cwd" ]; then
  git_branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
  [ -z "$git_branch" ] && git_branch=$(git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
  if [ -n "$git_branch" ] && [ "$git_dirty" != "true" ]; then
    [ -n "$(git -C "$cwd" status --porcelain --untracked-files=no 2>/dev/null | head -1)" ] && git_dirty=true
  fi
fi

# Ahead/behind vs upstream (one cheap git call; skipped if no upstream)
ahead_behind=""
if [ "$SHOW_GIT_AHEAD" = "true" ] && [ -n "$git_branch" ] && [ -n "$cwd" ] && [ -d "$cwd" ]; then
  ab=$(git -C "$cwd" rev-list --left-right --count '@{upstream}...HEAD' 2>/dev/null)
  if [ -n "$ab" ]; then
    behind=${ab%%[	 ]*}
    ahead=${ab##*[	 ]}
    [ "$ahead" -gt 0 ] 2>/dev/null && ahead_behind="${ahead_behind} \033[32m↑${ahead}\033[0m"
    [ "$behind" -gt 0 ] 2>/dev/null && ahead_behind="${ahead_behind} \033[31m↓${behind}\033[0m"
  fi
fi

dirty_mark=""
if [ "$git_dirty" = "true" ]; then
  dirty_mark="\033[31m*\033[0m"
fi

location_str=""
if [ -n "$worktree" ]; then
  location_str=" \033[35m⎇ ${worktree}\033[0m${dirty_mark}${ahead_behind}"
elif [ -n "$git_branch" ]; then
  location_str=" \033[35m(${git_branch})\033[0m${dirty_mark}${ahead_behind}"
fi

# ── Format Duration ───────────────────────────────────────────────────────────
if [ "$duration_ms" -gt 0 ] 2>/dev/null; then
  total_sec=$((duration_ms / 1000))
  hours=$((total_sec / 3600))
  mins=$(( (total_sec % 3600) / 60 ))
  if [ "$hours" -gt 0 ]; then
    duration_str="${hours}h ${mins}m"
  elif [ "$mins" -gt 0 ]; then
    duration_str="${mins}m"
  else
    duration_str="${total_sec}s"
  fi
else
  duration_str="0s"
fi

# ── Format Cost ───────────────────────────────────────────────────────────────
if [ "$cost" != "0" ] && [ -n "$cost" ]; then
  cost_str=$(printf '$%.2f' "$cost")
else
  cost_str='$0.00'
fi

# ── Burn Rate ($/hr) ──────────────────────────────────────────────────────────
# Only meaningful past the first minute; integer-cents math, no bc/awk
burn_str=""
if [ "$SHOW_BURN_RATE" = "true" ] && [ "$duration_ms" -ge 60000 ] 2>/dev/null; then
  cstr=${cost_str#\$}                      # "24.32"
  cfrac=${cstr#*.}00                        # decimals, padded
  cents=$(( ${cstr%%.*} * 100 + 10#${cfrac:0:2} ))
  if [ "$cents" -gt 0 ] 2>/dev/null; then
    rate_cents=$(( cents * 3600000 / duration_ms ))
    burn_str=$(printf ' \033[2m· ~$%d.%02d/hr\033[0m' $((rate_cents / 100)) $((rate_cents % 100)))
  fi
fi

# ── OSC 8 Hyperlink ───────────────────────────────────────────────────────────
# Wraps text in a clickable link; unsupported terminals just show the text.
# Returns *literal* escape sequences so it survives the header's printf '%b'.
osc_link() {
  local url=$1 text=$2
  if [ "$SHOW_LINKS" = "true" ] && [ -n "$url" ]; then
    printf '%s' '\033]8;;'"$url"'\033\\'"$text"'\033]8;;\033\\'
  else
    printf '%s' "$text"
  fi
}

# Session name (opt-in; truncated, since long /rename labels blow up line 1)
session_str=""
if [ "$SHOW_SESSION_NAME" = "true" ] && [ -n "$session_name" ]; then
  sn=$session_name
  [ "${#sn}" -gt 24 ] && sn="${sn:0:23}…"
  session_str=" \033[2m· ${sn}\033[0m"
fi

# ── Color Helpers ─────────────────────────────────────────────────────────────

ctx_color() {
  local pct=$1
  if [ "$pct" -lt "$CONTEXT_WARN_PCT" ]; then
    printf "\033[32m"
  elif [ "$pct" -lt "$CONTEXT_CRIT_PCT" ]; then
    printf "\033[33m"
  else
    printf "\033[31m"
  fi
}

make_bar() {
  local pct=$1 count=${2:-10}
  local filled=$(( pct * count / 100 ))
  [ "$filled" -gt "$count" ] && filled=$count

  local color
  if [ "$pct" -gt 50 ]; then
    color="\033[32m"
  elif [ "$pct" -gt 20 ]; then
    color="\033[33m"
  else
    color="\033[31m"
  fi

  local bar="" i=0
  while [ "$i" -lt "$count" ]; do
    [ "$i" -gt 0 ] && bar="${bar} "   # always spaced for legibility
    if [ "$i" -lt "$filled" ]; then
      bar="${bar}${color}●\033[0m"
    else
      bar="${bar}\033[2m○\033[0m"
    fi
    i=$((i + 1))
  done
  printf '%b' "$bar"
}

# Small 5-segment context gauge for the header (spaced, like the rate-limit bars)
ctx_bar() {
  local pct=$1 c
  c=$(ctx_color "$pct")
  local filled=$(( (pct + 19) / 20 ))   # round up so any usage shows ≥1 dot
  [ "$filled" -gt 5 ] && filled=5
  [ "$filled" -lt 0 ] && filled=0
  local bar="" i=0
  while [ "$i" -lt 5 ]; do
    [ "$i" -gt 0 ] && bar="${bar} "
    if [ "$i" -lt "$filled" ]; then
      bar="${bar}${c}●\033[0m"
    else
      bar="${bar}\033[2m○\033[0m"
    fi
    i=$((i + 1))
  done
  printf '%b' "$bar"
}

status_dot() {
  local pct=$1
  if [ "$pct" -gt 50 ]; then
    printf "\033[32m●\033[0m"
  elif [ "$pct" -gt 20 ]; then
    printf "\033[33m●\033[0m"
  else
    printf "\033[31m●\033[0m"
  fi
}

# ── Rate Limit Helpers ────────────────────────────────────────────────────────

format_remaining_epoch() {
  local reset_epoch=$1
  # null/empty reset = bucket idle (0% used) — the window hasn't started yet
  if [ -z "$reset_epoch" ] || [ "$reset_epoch" = "" ] || [ "$reset_epoch" = "null" ]; then
    echo "idle"
    return
  fi
  if echo "$reset_epoch" | grep -qE '^[0-9]+\.?[0-9]*$'; then
    reset_epoch=${reset_epoch%%.*}
  else
    local utc_ts=${reset_epoch%%+*}
    utc_ts=${utc_ts%%.*}
    reset_epoch=$(parse_iso_to_epoch "$utc_ts")
  fi
  local now_epoch remaining rd rh rm
  now_epoch=$(date +%s)
  if [ -n "$reset_epoch" ] && [ "$reset_epoch" -gt "$now_epoch" ] 2>/dev/null; then
    remaining=$(( reset_epoch - now_epoch ))
    rd=$((remaining / 86400))
    rh=$(( (remaining % 86400) / 3600 ))
    rm=$(( (remaining % 3600) / 60 ))
    if [ "$rd" -gt 0 ]; then
      echo "Resets in ${rd}d ${rh}h"
    elif [ "$rh" -gt 0 ]; then
      echo "Resets in ${rh}h ${rm}m"
    else
      echo "Resets in ${rm}m"
    fi
  else
    echo "Resetting"
  fi
}

print_limit_line() {
  local label=$1 used_val=$2 reset_val=$3
  [ -n "$used_val" ] || return
  local left=$((100 - used_val))
  if [ "$RL_COMPACT" -eq 1 ]; then
    # Very narrow: 5 spaced dots, short reset, no "left"/"Resets in"
    local rem; rem=$(format_remaining_epoch "$reset_val"); rem=${rem#Resets in }; rem=${rem// /}
    printf "  \033[2m%-7.7s\033[0m %b \033[36m%s%%\033[0m \033[2m%s\033[0m\n" \
      "$label" "$(make_bar "$left" 5)" "$left" "$rem"
  else
    printf "  \033[2m%-7.7s\033[0m %b %s  \033[36m%s%% left\033[0m  \033[2m%s\033[0m\n" \
      "$label" "$(status_dot "$left")" "$(make_bar "$left")" "$left" "$(format_remaining_epoch "$reset_val")"
  fi
}

# Bucket key → display label (works on bash 3.2 — no ${var^})
pretty_bucket() {
  case "$1" in
    oauth_apps) echo "Apps" ;;
    *) echo "$1" | awk -F_ '{ print toupper(substr($1,1,1)) substr($1,2) }' ;;
  esac
}

fmt_tokens() {
  local t=$1 div unit
  if [ "$t" -ge 1000000000 ] 2>/dev/null; then
    div=1000000000; unit=B
  elif [ "$t" -ge 1000000 ] 2>/dev/null; then
    div=1000000; unit=M
  elif [ "$t" -ge 1000 ] 2>/dev/null; then
    div=1000; unit=K
  else
    printf "%d" "$t"
    return
  fi
  local whole=$((t / div)) dec=$(( (t % div) * 10 / div ))
  if [ "$dec" -eq 0 ]; then
    printf "%d%s" "$whole" "$unit"
  else
    printf "%d.%d%s" "$whole" "$dec" "$unit"
  fi
}

# ── Rate Limits: stdin first, API fallback ────────────────────────────────────

# Try stdin rate_limits first (Claude Code v2.1.6+)
if [ -n "$stdin_5h_used" ] && [ "$stdin_5h_used" != "null" ]; then
  five_hour_used=$(printf '%.0f' "$stdin_5h_used" 2>/dev/null || echo 0)
  five_hour_reset="$stdin_5h_reset"
else
  five_hour_used=""
fi

if [ -n "$stdin_7d_used" ] && [ "$stdin_7d_used" != "null" ]; then
  seven_day_used=$(printf '%.0f' "$stdin_7d_used" 2>/dev/null || echo 0)
  seven_day_reset="$stdin_7d_reset"
else
  seven_day_used=""
fi

# API fallback: model-specific buckets (auto-detected) + Session/Weekly if stdin missing
api_buckets=""
extra_enabled=""; extra_used_pct=""

if [ "$SHOW_RATE_LIMITS" = "true" ]; then
  CACHE_FILE="$CACHE_DIR/usage.json"
  CACHE_TTL=120

  fetch_usage() {
    local TOKEN
    command -v curl >/dev/null 2>&1 || return 0
    TOKEN=$(get_oauth_token)
    if [ -n "$TOKEN" ]; then
      curl -s --max-time 3 "https://api.anthropic.com/api/oauth/usage" \
        -H "Authorization: Bearer $TOKEN" \
        -H "anthropic-beta: oauth-2025-04-20" 2>/dev/null
    fi
  }

  need_refresh=1
  if [ -f "$CACHE_FILE" ]; then
    cache_age=$(( $(date +%s) - $(get_mtime "$CACHE_FILE") ))
    if [ "$cache_age" -lt "$CACHE_TTL" ]; then
      need_refresh=0
    fi
  fi

  if [ "$need_refresh" -eq 1 ]; then
    usage_data=$(fetch_usage)
    if [ -n "$usage_data" ] && echo "$usage_data" | jq -e '.five_hour' >/dev/null 2>&1; then
      echo "$usage_data" > "$CACHE_FILE"
    fi
  fi

  if [ -s "$CACHE_FILE" ]; then
    eval "$(jq -r '
      @sh "api_5h_used=\(.five_hour.utilization // "" | if . != "" then (. | floor | tostring) else "" end)",
      @sh "api_5h_reset=\(.five_hour.resets_at // "")",
      @sh "api_7d_used=\(.seven_day.utilization // "" | if . != "" then (. | floor | tostring) else "" end)",
      @sh "api_7d_reset=\(.seven_day.resets_at // "")",
      @sh "extra_enabled=\(.extra_usage.is_enabled // false)",
      @sh "extra_used_pct=\(if .extra_usage.utilization then (.extra_usage.utilization | floor | tostring) else "" end)"
    ' "$CACHE_FILE")"

    # Any seven_day_<bucket> with data (Opus/Sonnet/Fable/... — keys change over time).
    # Order by model capability (best first); unknown buckets keep API order after.
    api_buckets=$(jq -r '
      ["fable","opus","sonnet","haiku"] as $rank
      | [ to_entries[]
          | select(.key | startswith("seven_day_"))
          | select((.value | type) == "object" and .value.utilization != null)
          | (.key | sub("^seven_day_"; "")) as $n
          | {name: $n, used: (.value.utilization | floor), reset: (.value.resets_at // ""), rank: (($rank | index($n)) // 99)} ]
      | sort_by(.rank, .name)
      | .[] | "\(.name)\t\(.used)\t\(.reset)"
    ' "$CACHE_FILE" 2>/dev/null)

    [ -z "$five_hour_used" ] && five_hour_used="$api_5h_used" && five_hour_reset="$api_5h_reset"
    [ -z "$seven_day_used" ] && seven_day_used="$api_7d_used" && seven_day_reset="$api_7d_reset"
  fi
fi

ctx_c=$(ctx_color "$used")

# ══════════════════════════════════════════════════════════════════════════════
# OUTPUT
# ══════════════════════════════════════════════════════════════════════════════
echo ""

# Model badges: fast mode / effort level / extended thinking
model_badges=""
[ "$fast_mode" = "true" ] && model_badges="${model_badges} \033[36m⚡fast\033[0m"
[ -n "$effort" ] && model_badges="${model_badges} \033[2m${effort}\033[0m"
[ "$thinking" = "true" ] && model_badges="${model_badges} \033[2m✦\033[0m"

# Context mini-bar (low usage = good = green) + used/total tokens — wide only
ctx_bar_str=""
if [ "$SHOW_CONTEXT_BAR" = "true" ] && [ "$WIDE" -eq 1 ]; then
  ctx_bar_str=" $(ctx_bar "$used")"
fi
ctx_detail=""
if [ -n "$ctx_tokens" ] && [ "$ctx_size" -gt 0 ] 2>/dev/null && [ "$WIDE" -eq 1 ]; then
  ctx_detail=" \033[2m$(fmt_tokens "$ctx_tokens")/$(fmt_tokens "$ctx_size")\033[0m"
fi

# PR badge with review state (clickable when a URL is present)
pr_str=""
if [ -n "$pr_number" ]; then
  case "$pr_state" in
    approved)          pr_mark=" \033[32m✓\033[0m" ;;
    changes_requested) pr_mark=" \033[31m✗\033[0m" ;;
    draft)             pr_mark=" \033[2m◌\033[0m" ;;
    *)                 pr_mark=" \033[33m●\033[0m" ;;
  esac
  pr_label=$(osc_link "$pr_url" "PR #${pr_number}")
  pr_str=" \033[2m│\033[0m \033[36m${pr_label}\033[0m${pr_mark}"
fi

# Lines added/removed this session
lines_str=""
if [ "$lines_added" -gt 0 ] 2>/dev/null || [ "$lines_removed" -gt 0 ] 2>/dev/null; then
  lines_str=" \033[32m+${lines_added}\033[0m \033[31m-${lines_removed}\033[0m"
fi

# Burn rate is a wide-only extra; session name drops on the narrowest tier
[ "$WIDE" -ne 1 ] && burn_str=""
[ "$COMPACT" -eq 1 ] && session_str=""

if [ "$COMPACT" -eq 1 ]; then
  # Minimal header for narrow terminals: model | ctx% | project (branch) | cost
  printf "  \033[1;37m%s\033[0m \033[2m│\033[0m %bctx %s%%\033[0m \033[2m│\033[0m \033[33m%s\033[0m%b \033[2m│\033[0m \033[2m%s\033[0m\n" \
    "$model" "$ctx_c" "$used" "$project" "$location_str" "$cost_str"
else
  # Full / medium: extras (bar, tokens, burn) are pre-blanked unless WIDE
  printf "  \033[1;37m%s\033[0m%b \033[2m│\033[0m %bctx %s%%\033[0m%b%b \033[2m│\033[0m \033[33m%s\033[0m%b%b \033[2m│\033[0m \033[2m%s · %s\033[0m%b%b%b\n" \
    "$model" "$model_badges" "$ctx_c" "$used" "$ctx_bar_str" "$ctx_detail" "$project" "$location_str" "$pr_str" "$cost_str" "$duration_str" "$burn_str" "$lines_str" "$session_str"
fi

# Compaction warning
if [ "$used" -ge "$CONTEXT_CRIT_PCT" ]; then
  printf "  \033[1;31m⚠ Context %s%% — compaction imminent\033[0m\n" "$used"
fi

# Rate limit lines
if [ "$SHOW_RATE_LIMITS" = "true" ]; then
  if [ -z "$five_hour_used" ] && [ -z "$seven_day_used" ] && ! command -v curl >/dev/null 2>&1; then
    printf "  \033[2m✗ rate limits unavailable — curl not found\033[0m\n"
  fi
  print_limit_line "Session" "$five_hour_used" "$five_hour_reset"
  print_limit_line "Weekly"  "$seven_day_used" "$seven_day_reset"
  if [ -n "$api_buckets" ]; then
    while IFS=$'\t' read -r bkt_name bkt_used bkt_reset; do
      [ -z "$bkt_name" ] && continue
      print_limit_line "$(pretty_bucket "$bkt_name")" "$bkt_used" "$bkt_reset"
    done <<< "$api_buckets"
  fi
  if [ "$extra_enabled" = "true" ] && [ -n "$extra_used_pct" ]; then
    print_limit_line "Extra" "$extra_used_pct" ""
  fi
fi

# Tool / Agent Activity (from transcript)
if [ "$SHOW_TOOLS" = "true" ] || [ "$SHOW_AGENTS" = "true" ]; then
  if [ -n "$transcript_path" ] && [ -s "$transcript_path" ]; then
    transcript_data=$(tail -500 "$transcript_path" | jq -c -s '
      [.[] |
        if .type == "assistant" and (.message.content | type) == "array" then
          (.message.content)[] | select(.type == "tool_use") |
          {action: "use", id: .id, name: .name, target: (
            if .name == "Read" or .name == "Write" or .name == "Edit" then (.input.file_path // .input.path // "" | split("/") | .[-1:] | join(""))
            elif .name == "Glob" or .name == "Grep" then (.input.pattern // "")
            elif .name == "Bash" then (.input.command // "" | .[0:30])
            elif .name == "Agent" then (.input.description // .input.subagent_type // "")
            else ""
            end
          ), subagent_type: (.input.subagent_type // ""), agent_desc: (.input.description // "")}
        elif .type == "user" and (.message.content | type) == "array" then
          (.message.content)[] | select(.type == "tool_result") |
          {action: "result", id: .tool_use_id, is_error: (.is_error // false)}
        else empty
        end
      ] |
      (reduce .[] as $item (
        {tools: {}, agents: {}, completed: {}};
        if $item.action == "use" then
          if $item.name == "Agent" then
            .agents[$item.id] = {type: $item.subagent_type, desc: $item.agent_desc, status: "running"}
          elif $item.name != "TodoWrite" and $item.name != "TaskCreate" and $item.name != "TaskUpdate" then
            .tools[$item.id] = {name: $item.name, target: $item.target, status: "running"}
          else .
          end
        elif $item.action == "result" then
          if .agents[$item.id] then
            .agents[$item.id].status = "done"
          elif .tools[$item.id] then
            .tools[$item.id] as $t |
            .tools[$item.id].status = "done" |
            .completed[$t.name] = ((.completed[$t.name] // 0) + 1)
          else .
          end
        else .
        end
      )) |
      {
        running_tools: [.tools | to_entries[] | select(.value.status == "running") | {name: .value.name, target: .value.target}] | .[-3:],
        completed: .completed,
        running_agents: [.agents | to_entries[] | select(.value.status == "running") | {type: .value.type, desc: .value.desc}] | .[-3:],
        done_agents: [.agents | to_entries[] | select(.value.status != "running")] | length
      }
    ' 2>/dev/null)

    if [ -n "$transcript_data" ] && [ "$transcript_data" != "null" ]; then
      IFS=$'\x1e' read -r running_tools completed_tools running_agents done_agent_count <<< "$(
        jq -r '[
          (.running_tools | if length > 0 then [.[] | "◐ \(.name)" + (if .target != "" then ":\(.target)" else "" end)] | join("  ") else "" end),
          (.completed | to_entries | sort_by(-.value) | if length > 0 then [.[:5][] | "✓ \(.key)×\(.value)"] | join("  ") else "" end),
          (.running_agents | if length > 0 then [.[] | "◐ \(.type)" + (if .desc != "" then " \(.desc)" else "" end)] | join("  ") else "" end),
          (.done_agents | tostring)
        ] | join("\u001e")' <<< "$transcript_data"
      )"

      # Tools line
      if [ "$SHOW_TOOLS" = "true" ]; then
        if [ -n "$running_tools" ] || [ -n "$completed_tools" ]; then
          tool_line="  "
          if [ -n "$running_tools" ]; then
            tool_line="${tool_line}\033[33m${running_tools}\033[0m"
            [ -n "$completed_tools" ] && tool_line="${tool_line}  \033[2m${completed_tools}\033[0m"
          else
            tool_line="${tool_line}\033[2m${completed_tools}\033[0m"
          fi
          printf '%b\n' "$tool_line"
        fi
      fi

      # Agents line
      if [ "$SHOW_AGENTS" = "true" ]; then
        if [ -n "$running_agents" ]; then
          agent_line="  \033[35m${running_agents}\033[0m"
          [ "$done_agent_count" -gt 0 ] 2>/dev/null && agent_line="${agent_line}  \033[2m(${done_agent_count} done)\033[0m"
          printf '%b\n' "$agent_line"
        elif [ "$done_agent_count" -gt 0 ] 2>/dev/null; then
          printf '  \033[2m✓ %s agents done\033[0m\n' "$done_agent_count"
        fi
      fi
    fi
  fi
fi

echo ""
