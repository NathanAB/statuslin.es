#!/bin/bash
export TERM=xterm-256color
input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir')
model=$(echo "$input" | jq -r '.model.display_name // empty')

# Token usage
input_tokens=$(echo "$input" | jq -r '.context_window.total_input_tokens // 0')
output_tokens=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')
context_limit=$(echo "$input" | jq -r '.context_window.context_window_size // 0')
total_tokens=$((input_tokens + output_tokens))

# Cost & stats
cost=$(echo "$input" | jq -r '.cost.total_cost_usd // empty')
duration_ms=$(echo "$input" | jq -r '.cost.total_duration_ms // 0')
lines_added=$(echo "$input" | jq -r '.cost.total_lines_added // 0')
lines_removed=$(echo "$input" | jq -r '.cost.total_lines_removed // 0')

# Colors - basic ANSI codes compatible with most terminals
RED=$'\033[31m'
GREEN=$'\033[32m'
YELLOW=$'\033[33m'
BLUE=$'\033[34m'
MAGENTA=$'\033[35m'
CYAN=$'\033[36m'
GRAY=$'\033[90m'
RESET=$'\033[0m'

SEP="${GRAY}${RESET}"
short_dir=$(basename "$cwd")

# Node version (only if package.json exists)
node_info=""
if [ -f "$cwd/package.json" ] 2>/dev/null; then
  node_ver=$(node -v 2>/dev/null | sed 's/v//')
  [ -n "$node_ver" ] && node_info=" ${SEP} ${GREEN}⬢ ${node_ver}${RESET}"
fi

# Session duration
duration_info=""
if [ "$duration_ms" -gt 0 ] 2>/dev/null; then
  duration_sec=$((duration_ms / 1000))
  if [ "$duration_sec" -ge 3600 ]; then
    hours=$((duration_sec / 3600))
    mins=$(((duration_sec % 3600) / 60))
    duration_fmt="${hours}h${mins}m"
  elif [ "$duration_sec" -ge 60 ]; then
    mins=$((duration_sec / 60))
    duration_fmt="${mins}m"
  else
    duration_fmt="${duration_sec}s"
  fi
  duration_info=" ${SEP} ${CYAN}⏱ ${duration_fmt}${RESET}"
fi

# Lines changed
lines_info=""
if [ "$lines_added" -gt 0 ] || [ "$lines_removed" -gt 0 ] 2>/dev/null; then
  net=$((lines_added - lines_removed))
  if [ "$net" -gt 0 ]; then
    net_symbol="${GREEN}▲${RESET}"
  elif [ "$net" -lt 0 ]; then
    net_symbol="${RED}▼${RESET}"
  else
    net_symbol="${GRAY}=${RESET}"
  fi
  lines_info=" ${SEP} ${net_symbol} ${GREEN}+${lines_added}${RESET} ${RED}-${lines_removed}${RESET}"
fi

# Token usage with progress bar
token_info=""
if [ "$total_tokens" -gt 0 ] 2>/dev/null; then
  if [ "$total_tokens" -ge 1000 ]; then
    tokens_fmt="$((total_tokens / 1000))k"
  else
    tokens_fmt="$total_tokens"
  fi

  if [ "$context_limit" -gt 0 ] 2>/dev/null; then
    pct=$((total_tokens * 100 / context_limit))

    # Color based on usage
    if [ "$pct" -ge 75 ]; then
      bar_color="$RED"
    elif [ "$pct" -ge 50 ]; then
      bar_color="$YELLOW"
    else
      bar_color="$GREEN"
    fi

    # Build progress bar using simple chars: ▓ filled, ░ empty
    bar_width=8
    filled=$((pct * bar_width / 100))
    [ "$filled" -gt "$bar_width" ] && filled=$bar_width
    [ "$filled" -lt 1 ] && [ "$pct" -gt 0 ] && filled=1
    empty=$((bar_width - filled))

    bar="${bar_color}"
    for ((i=0; i<filled; i++)); do bar+="▓"; done
    bar+="${GRAY}"
    for ((i=0; i<empty; i++)); do bar+="░"; done
    bar+="${RESET}"

    token_info=" ${SEP} ${bar} ${GRAY}${pct}%${RESET}"
  fi
fi

# Cost with meaningful colors
cost_info=""
if [ -n "$cost" ] && [ "$cost" != "null" ]; then
  cost_fmt=$(printf "%.2f" "$cost")
  cost_cents=$(printf "%.0f" "$(echo "$cost * 100" | bc)")

  if [ "$cost_cents" -ge 1000 ] 2>/dev/null; then
    cost_color="$RED"
  elif [ "$cost_cents" -ge 200 ] 2>/dev/null; then
    cost_color="$YELLOW"
  else
    cost_color="$GREEN"
  fi
  cost_info=" ${SEP} ${cost_color}\$${cost_fmt}${RESET}"
fi

# Model with tier colors
model_info=""
if [ -n "$model" ]; then
  case "$model" in
    *Opus*) model_color="$MAGENTA"; model_symbol="◆"; short_model="Opus" ;;
    *Sonnet*) model_color="$BLUE"; model_symbol="◇"; short_model="Sonnet" ;;
    *Haiku*) model_color="$GREEN"; model_symbol="○"; short_model="Haiku" ;;
    *) model_color="$GRAY"; model_symbol="●"; short_model="$model" ;;
  esac
  model_info=" ${SEP} ${model_color}${model_symbol} ${short_model}${RESET}"
fi

printf "${BLUE}${short_dir}${RESET}%s%s%s%s%s%s" "$node_info" "$duration_info" "$lines_info" "$token_info" "$cost_info" "$model_info"
