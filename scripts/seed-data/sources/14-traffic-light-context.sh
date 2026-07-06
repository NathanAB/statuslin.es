#!/usr/bin/env bash
# Claude Code status line script

input=$(cat)

# Model
model=$(echo "$input" | jq -r '.model.display_name // "Unknown"')

# Git branch (skip locks)
branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$(echo "$input" | jq -r '.workspace.current_dir // "."')" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")

# Token data
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
window_size=$(echo "$input" | jq -r '.context_window.context_window_size // 0')
# Derive the absolute token count from used_percentage * window_size so that
# the bar, percentage, and token count are always consistent with each other.
# (current_usage.input_tokens is only the last-turn input, not total context fill.)
current_input=""
if [ -n "$used_pct" ] && [ "$window_size" -gt 0 ] 2>/dev/null; then
  current_input=$(echo "$used_pct $window_size" | awk '{printf "%d", ($1/100)*$2}')
fi

# Rate limit data
five_hour_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
five_hour_resets=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
seven_day_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
seven_day_resets=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')

# ANSI colors (dimmed-friendly)
RESET='\033[0m'
BOLD='\033[1m'
DIM='\033[2m'
CYAN='\033[36m'
YELLOW='\033[33m'
GREEN='\033[32m'
RED='\033[31m'
ORANGE='\033[38;5;214m'
MAGENTA='\033[35m'
BLUE='\033[34m'
WHITE='\033[37m'

# Build progress bar (10 chars wide)
build_bar() {
  local pct="${1:-0}"
  local width=10
  local filled=$(echo "$pct $width" | awk '{printf "%d", ($1/100)*$2}')
  local empty=$((width - filled))

  # 0-40%: green (smart zone — full quality)
  # 40-60%: orange (time to /compact)
  # 60%+: red (quality degrading, auto-compact approaching)
  local bar_color="$GREEN"
  if [ "$(echo "$pct" | awk '{print ($1 >= 60)}')" = "1" ]; then
    bar_color="$RED"
  elif [ "$(echo "$pct" | awk '{print ($1 >= 40)}')" = "1" ]; then
    bar_color="$ORANGE"
  fi

  local bar=""
  local i=0
  while [ $i -lt $filled ]; do
    bar="${bar}█"
    i=$((i+1))
  done
  i=0
  while [ $i -lt $empty ]; do
    bar="${bar}░"
    i=$((i+1))
  done

  printf "${bar_color}${bar}${RESET}"
}

# Color for context window percentage (matches build_bar thresholds)
ctx_color() {
  local pct="${1:-0}"
  if [ "$(echo "$pct" | awk '{print ($1 >= 60)}')" = "1" ]; then
    echo "$RED"
  elif [ "$(echo "$pct" | awk '{print ($1 >= 40)}')" = "1" ]; then
    echo "$ORANGE"
  else
    echo "$GREEN"
  fi
}

# Color for rate-limit percentages: green <50%, orange <80%, red >=80%
rate_color() {
  local pct="${1:-0}"
  if [ "$(echo "$pct" | awk '{print ($1 >= 80)}')" = "1" ]; then
    echo "$RED"
  elif [ "$(echo "$pct" | awk '{print ($1 >= 50)}')" = "1" ]; then
    echo "$ORANGE"
  else
    echo "$GREEN"
  fi
}

# Format seconds-until-reset as HH:MM
fmt_countdown() {
  local resets_at="$1"
  local now
  now=$(date +%s)
  local diff=$((resets_at - now))
  if [ "$diff" -le 0 ]; then
    echo "00:00"
    return
  fi
  local hh=$((diff / 3600))
  local mm=$(( (diff % 3600) / 60 ))
  printf "%02d:%02d" "$hh" "$mm"
}

# Format large numbers with k/M suffix
fmt_num() {
  local n="$1"
  echo "$n" | awk '{
    if ($1 >= 1000000) printf "%gM", $1/1000000
    else if ($1 >= 1000) printf "%gk", $1/1000
    else printf "%d", $1
  }'
}

# Format the current context window token count and total window size
window_fmt=$(fmt_num "$window_size")

# Build output
printf "${CYAN}${BOLD}%s${RESET}" "$model"
printf " ${DIM}|${RESET} "
printf "${MAGENTA}%s${RESET}" "$branch"
printf " ${DIM}|${RESET} "

if [ -n "$used_pct" ]; then
  bar=$(build_bar "$used_pct")
  pct_fmt=$(printf "%.1f" "$used_pct")
  current_fmt=$(fmt_num "$current_input")
  pct_color=$(ctx_color "$used_pct")
  printf "%s ${pct_color}%s%%${RESET}" "$bar" "$pct_fmt"
  printf " ${DIM}|${RESET} "
  printf "${BLUE}%s / %s${RESET}" "$current_fmt" "$window_fmt"
else
  printf "${DIM}no messages yet${RESET}"
fi

# 5-hour window: HH:MM countdown + percentage consumed
if [ -n "$five_hour_pct" ] && [ -n "$five_hour_resets" ]; then
  countdown=$(fmt_countdown "$five_hour_resets")
  color=$(rate_color "$five_hour_pct")
  pct_fmt=$(printf "%.0f" "$five_hour_pct")
  printf " ${DIM}|${RESET} "
  printf "${DIM}%s${RESET} ${color}%s%%${RESET}" "$countdown" "$pct_fmt"
fi

# 7-day window: day abbreviation + percentage consumed
if [ -n "$seven_day_pct" ] && [ -n "$seven_day_resets" ]; then
  day_abbr=$(date -d "@${seven_day_resets}" +%a 2>/dev/null || date -r "$seven_day_resets" +%a 2>/dev/null)
  color=$(rate_color "$seven_day_pct")
  pct_fmt=$(printf "%.0f" "$seven_day_pct")
  printf " ${DIM}|${RESET} "
  printf "${DIM}%s${RESET} ${color}%s%%${RESET}" "$day_abbr" "$pct_fmt"
fi

printf "\n"
