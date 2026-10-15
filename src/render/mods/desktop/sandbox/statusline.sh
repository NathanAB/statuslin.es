#!/bin/bash
# The sample status line every Desktop recording runs, so a mod that shows the user's status line
# (statusline-anywhere) has one to draw. Offline: it reads only the stdin JSON Claude Code sends.
input=$(cat)
model=$(jq -r '.model.display_name // "Claude"' <<<"$input")
dir=$(jq -r '.workspace.current_dir // "" | split("/") | last' <<<"$input")
used=$(jq -r '.context_window.used_percentage // 0 | floor' <<<"$input")
cost=$(jq -r '.cost.total_cost_usd // 0' <<<"$input")
printf '\033[35m%s\033[0m \033[2m|\033[0m \033[36m%s\033[0m \033[2m|\033[0m ctx %s%% \033[2m|\033[0m \033[32m$%.2f\033[0m' \
  "$model" "$dir" "$used" "$cost"
