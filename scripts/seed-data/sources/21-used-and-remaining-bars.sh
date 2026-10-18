#!/bin/bash
# claudecode-statusline — Claude Code statusline renderer
# Shows: caveman mode, project/folder, git branch, model, ctx%, effort,
#        5h and 7d rate-limit bars with used%/rem% + time-to-reset.
#
# Component env vars (set to 0 to hide):
#   SL_CAVEMAN=0   SL_PROJECT=0   SL_MODEL=0   SL_CTX=0
#   SL_EFFORT=0    SL_5H=0        SL_7D=0       SL_SAVINGS=0

# ── helpers ───────────────────────────────────────────────────────────────────

fill_bar() {
  local pct="${1:-0}" width="${2:-10}"
  local filled=$(( pct * width / 100 ))
  [ $filled -gt $width ] && filled=$width
  local empty=$(( width - filled ))
  local bar="" i=0
  while [ $i -lt $filled ]; do bar="${bar}█"; i=$(( i + 1 )); done
  while [ $i -lt $width ];  do bar="${bar}░"; i=$(( i + 1 )); done
  printf '%s' "$bar"
}

fmt_seconds() {
  local secs="${1:-0}"
  local now remaining
  now=$(date +%s)
  remaining=$(( secs - now ))
  [ $remaining -lt 0 ] && remaining=0
  local days=$(( remaining / 86400 ))
  local hrs=$(( (remaining % 86400) / 3600 ))
  local mins=$(( (remaining % 3600) / 60 ))
  if [ $days -gt 0 ]; then
    printf '%dd %dh' "$days" "$hrs"
  elif [ $hrs -gt 0 ]; then
    printf '%dh %dm' "$hrs" "$mins"
  else
    printf '%dm' "$mins"
  fi
}

# Return ANSI color for a "used" percentage (green→yellow→red as usage rises)
used_color() {
  local pct="${1:-0}"
  if   [ "$pct" -ge 80 ]; then printf '\033[38;5;196m'   # red
  elif [ "$pct" -ge 50 ]; then printf '\033[38;5;220m'   # yellow
  else                          printf '\033[38;5;114m'  # green
  fi
}

# Return ANSI color for a "remaining" percentage (red→yellow→green as remainder rises)
rem_color() {
  local pct="${1:-0}"
  if   [ "$pct" -le 20 ]; then printf '\033[38;5;196m'   # red — almost none left
  elif [ "$pct" -le 50 ]; then printf '\033[38;5;220m'   # yellow
  else                          printf '\033[38;5;114m'  # green — plenty left
  fi
}

# ── read stdin JSON ───────────────────────────────────────────────────────────
INPUT=$(cat)

# ── caveman badge ─────────────────────────────────────────────────────────────
CAVEMAN_BADGE=""
if [ "${SL_CAVEMAN:-1}" != "0" ]; then
  FLAG="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.caveman-active"
  if [ ! -L "$FLAG" ] && [ -f "$FLAG" ]; then
    MODE=$(head -c 64 "$FLAG" 2>/dev/null | tr -d '\n\r' | tr '[:upper:]' '[:lower:]')
    MODE=$(printf '%s' "$MODE" | tr -cd 'a-z0-9-')
    case "$MODE" in
      off|lite|full|ultra|wenyan-lite|wenyan|wenyan-full|wenyan-ultra|commit|review|compress)
        if [ -z "$MODE" ] || [ "$MODE" = "full" ]; then
          CAVEMAN_BADGE=$(printf '\033[38;5;172m[🪨 CAVEMAN]\033[0m')
        else
          SUFFIX=$(printf '%s' "$MODE" | tr '[:lower:]' '[:upper:]')
          CAVEMAN_BADGE=$(printf '\033[38;5;172m[🪨 CAVEMAN:%s]\033[0m' "$SUFFIX")
        fi
        ;;
    esac
  fi
fi

# ── project / folder name ─────────────────────────────────────────────────────
PROJECT_BADGE=""
GIT_BRANCH=""
if [ "${SL_PROJECT:-1}" != "0" ]; then
  PROJECT_DIR=$(printf '%s' "$INPUT" | jq -r '.workspace.project_dir // .workspace.current_dir // .cwd // empty' 2>/dev/null)
  [ -z "$PROJECT_DIR" ] && PROJECT_DIR=$(pwd)
  PROJECT_NAME=$(basename "$PROJECT_DIR")
  PROJECT_BADGE=$(printf '\033[38;5;75m📁 %s\033[0m' "$PROJECT_NAME")

  if command -v git >/dev/null 2>&1; then
    GIT_DIR_ARG=""
    [ -n "$PROJECT_DIR" ] && [ -d "$PROJECT_DIR/.git" ] && GIT_DIR_ARG="-C $PROJECT_DIR"
    BRANCH=$(git $GIT_DIR_ARG -c core.hooksPath=/dev/null branch --show-current 2>/dev/null)
    [ -n "$BRANCH" ] && GIT_BRANCH=$(printf '\033[38;5;114m 🌿 %s\033[0m' "$BRANCH")
  fi
fi

# ── model ─────────────────────────────────────────────────────────────────────
MODEL_BADGE=""
if [ "${SL_MODEL:-1}" != "0" ]; then
  MODEL=$(printf '%s' "$INPUT" | jq -r '.model.display_name // empty' 2>/dev/null)
  [ -n "$MODEL" ] && MODEL_BADGE=$(printf '\033[38;5;183m🤖 %s\033[0m' "$MODEL")
fi

# ── context window ────────────────────────────────────────────────────────────
CTX_BADGE=""
if [ "${SL_CTX:-1}" != "0" ]; then
  USED_PCT=$(printf '%s' "$INPUT" | jq -r '.context_window.used_percentage // empty' 2>/dev/null)
  if [ -n "$USED_PCT" ] && [ "$USED_PCT" != "null" ]; then
    USED_INT=$(printf '%.0f' "$USED_PCT" 2>/dev/null || echo 0)
    CTX_BAR=$(fill_bar "$USED_INT" 8)
    BAR_COLOR=$(used_color "$USED_INT")
    CTX_BADGE=$(printf "${BAR_COLOR}CTX %s %d%%\033[0m" "$CTX_BAR" "$USED_INT")
  fi
fi

# ── effort level ──────────────────────────────────────────────────────────────
EFFORT_BADGE=""
if [ "${SL_EFFORT:-1}" != "0" ]; then
  EFFORT=$(printf '%s' "$INPUT" | jq -r '.effort.level // empty' 2>/dev/null)
  if [ -n "$EFFORT" ] && [ "$EFFORT" != "null" ]; then
    EFFORT_UP=$(printf '%s' "$EFFORT" | tr '[:lower:]' '[:upper:]')
    case "$EFFORT" in
      low)    EFFORT_COLOR='\033[38;5;244m'; EFFORT_ICON="▁" ;;
      medium) EFFORT_COLOR='\033[38;5;75m';  EFFORT_ICON="▄" ;;
      high)   EFFORT_COLOR='\033[38;5;220m'; EFFORT_ICON="▇" ;;
      xhigh)  EFFORT_COLOR='\033[38;5;208m'; EFFORT_ICON="█" ;;
      max)    EFFORT_COLOR='\033[38;5;196m'; EFFORT_ICON="█" ;;
      *)      EFFORT_COLOR='\033[38;5;244m'; EFFORT_ICON="?" ;;
    esac
    EFFORT_BADGE=$(printf "${EFFORT_COLOR}⚡ %s %s\033[0m" "$EFFORT_ICON" "$EFFORT_UP")
  fi
fi

# ── 5-hour rate limit ─────────────────────────────────────────────────────────
FIVE_H_BADGE=""
if [ "${SL_5H:-1}" != "0" ]; then
  FIVE_H_PCT=$(printf '%s' "$INPUT" | jq -r '.rate_limits.five_hour.used_percentage // empty' 2>/dev/null)
  FIVE_H_RESET=$(printf '%s' "$INPUT" | jq -r '.rate_limits.five_hour.resets_at // empty' 2>/dev/null)
  if [ -n "$FIVE_H_PCT" ] && [ "$FIVE_H_PCT" != "null" ]; then
    FIVE_H_INT=$(printf '%.0f' "$FIVE_H_PCT" 2>/dev/null || echo 0)
    FIVE_H_REM=$(( 100 - FIVE_H_INT ))
    FIVE_H_BAR=$(fill_bar "$FIVE_H_INT" 8)
    U_COLOR=$(used_color "$FIVE_H_INT")
    R_COLOR=$(rem_color "$FIVE_H_REM")
    RESET_STR=""
    if [ -n "$FIVE_H_RESET" ] && [ "$FIVE_H_RESET" != "null" ] && [ "$FIVE_H_RESET" -gt 0 ] 2>/dev/null; then
      RESET_STR=$(printf ' ↺ %s' "$(fmt_seconds "$FIVE_H_RESET")")
    fi
    FIVE_H_BADGE=$(printf "${U_COLOR}5h %s %d%% used\033[0m ${R_COLOR}%d%% rem\033[0m%s" \
      "$FIVE_H_BAR" "$FIVE_H_INT" "$FIVE_H_REM" "$RESET_STR")
  fi
fi

# ── 7-day rate limit ──────────────────────────────────────────────────────────
SEVEN_D_BADGE=""
if [ "${SL_7D:-1}" != "0" ]; then
  SEVEN_D_PCT=$(printf '%s' "$INPUT" | jq -r '.rate_limits.seven_day.used_percentage // empty' 2>/dev/null)
  SEVEN_D_RESET=$(printf '%s' "$INPUT" | jq -r '.rate_limits.seven_day.resets_at // empty' 2>/dev/null)
  if [ -n "$SEVEN_D_PCT" ] && [ "$SEVEN_D_PCT" != "null" ]; then
    SEVEN_D_INT=$(printf '%.0f' "$SEVEN_D_PCT" 2>/dev/null || echo 0)
    SEVEN_D_REM=$(( 100 - SEVEN_D_INT ))
    SEVEN_D_BAR=$(fill_bar "$SEVEN_D_INT" 8)
    U7_COLOR=$(used_color "$SEVEN_D_INT")
    R7_COLOR=$(rem_color "$SEVEN_D_REM")
    RESET_7D_STR=""
    if [ -n "$SEVEN_D_RESET" ] && [ "$SEVEN_D_RESET" != "null" ] && [ "$SEVEN_D_RESET" -gt 0 ] 2>/dev/null; then
      RESET_7D_STR=$(printf ' ↺ %s' "$(fmt_seconds "$SEVEN_D_RESET")")
    fi
    SEVEN_D_BADGE=$(printf "${U7_COLOR}7d %s %d%% used\033[0m ${R7_COLOR}%d%% rem\033[0m%s" \
      "$SEVEN_D_BAR" "$SEVEN_D_INT" "$SEVEN_D_REM" "$RESET_7D_STR")
  fi
fi

# ── caveman savings ───────────────────────────────────────────────────────────
SAVINGS_BADGE=""
if [ "${SL_SAVINGS:-1}" != "0" ] && [ "${CAVEMAN_STATUSLINE_SAVINGS:-1}" != "0" ]; then
  SAVINGS_FILE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.caveman-statusline-suffix"
  if [ -f "$SAVINGS_FILE" ] && [ ! -L "$SAVINGS_FILE" ]; then
    SAVINGS=$(head -c 64 "$SAVINGS_FILE" 2>/dev/null | tr -d '\000-\037')
    [ -n "$SAVINGS" ] && SAVINGS_BADGE=$(printf '\033[38;5;172m%s\033[0m' "$SAVINGS")
  fi
fi

# ── assemble output ───────────────────────────────────────────────────────────
SEP=$(printf '\033[38;5;240m │ \033[0m')
OUT=""

append() {
  local part="$1"
  [ -z "$part" ] && return
  if [ -z "$OUT" ]; then OUT="$part"
  else OUT="${OUT}${SEP}${part}"
  fi
}

append "$CAVEMAN_BADGE"
[ -n "$PROJECT_BADGE" ] && append "$PROJECT_BADGE$GIT_BRANCH"
append "$MODEL_BADGE"
append "$CTX_BADGE"
append "$EFFORT_BADGE"
append "$FIVE_H_BADGE"
append "$SEVEN_D_BADGE"
append "$SAVINGS_BADGE"

printf '%s' "$OUT"
