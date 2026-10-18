#!/usr/bin/env python3
"""
ClaudeStatsBar - a Claude Code status line that shows what a turn costs.

Tells you when a session has grown expensive enough to be worth clearing.

Why: every turn re-reads the whole accumulated context as cache reads. That is
the dominant cost in a long session (measured: 57.8% of weighted spend), and it
grows with the square of session length, because turn N re-reads everything from
turns 1..N-1. Doing the same work in several short sessions instead of one long
one is materially cheaper. This makes that visible while you work.

Install: ./install.sh  (see README.md)
Cross-platform: pure stdlib, no shell, no transcript parsing.
"""

import json
import os
import sys
import time

# --- thresholds (tokens of context). Override via env. ---
WARN = int(os.environ.get("CC_CTX_WARN", 60_000))
HIGH = int(os.environ.get("CC_CTX_HIGH", 120_000))
# fraction of the context window at which "running out of room" beats "too costly"
FULL_PCT = float(os.environ.get("CC_CTX_FULL_PCT", 80))
NO_COLOR = bool(os.environ.get("NO_COLOR"))

STATE_DIR = os.path.join(os.path.expanduser("~"), ".claude", ".statusline-state")

R = "\033[0m"
DIM = "\033[2m"
BOLD = "\033[1m"
GREEN = "\033[38;5;78m"
AMBER = "\033[38;5;214m"
RED = "\033[38;5;203m"
BLUE = "\033[38;5;110m"
GREY = "\033[38;5;245m"


def c(s, colour):
    return s if NO_COLOR else f"{colour}{s}{R}"


def human(n):
    if n is None:
        return "?"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if n >= 1_000:
        return f"{n / 1000:.0f}k" if n >= 10_000 else f"{n / 1000:.1f}k"
    return str(n)


def dig(d, *path, default=None):
    """Safe nested lookup; every field here can be absent early in a session."""
    for k in path:
        if not isinstance(d, dict):
            return default
        d = d.get(k)
        if d is None:
            return default
    return d


def load_state(session_id):
    if not session_id:
        return {}
    try:
        p = os.path.join(STATE_DIR, f"{session_id}.json")
        if os.path.exists(p):
            with open(p) as f:
                return json.load(f)
    except Exception:
        pass
    return {}


def save_state(session_id, state):
    if not session_id:
        return
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(os.path.join(STATE_DIR, f"{session_id}.json"), "w") as f:
            json.dump(state, f)
        # opportunistic cleanup of state files older than a week
        if int(time.time()) % 37 == 0:
            cutoff = time.time() - 7 * 86400
            for fn in os.listdir(STATE_DIR):
                fp = os.path.join(STATE_DIR, fn)
                if os.path.getmtime(fp) < cutoff:
                    os.remove(fp)
    except Exception:
        pass


def baseline(state, ctx):
    """
    Smallest context this session has been observed at, so we can show how much
    more each turn costs now than at the start. Self-calibrating: no hardcoded
    assumption about the size of your CLAUDE.md or tool schemas.

    Returns None when the status line joined an already-large session: we never
    saw the real start, so any ratio would be a reassuring lie.
    """
    lo = state.get("min_ctx")
    if lo is None or (ctx and ctx < lo):
        lo = ctx
        state["min_ctx"] = lo
    return None if (lo is None or lo >= WARN) else lo


def rate_burn(state, pct, turns):
    """
    Turns of headroom left in the 5-hour window at this session's observed burn
    rate. This, not a notional dollar figure, is the real budget on a
    subscription. Re-baselines when the rolling window resets (pct drops).
    """
    if pct is None or turns is None:
        return None
    first_pct, first_turns = state.get("rl5_pct"), state.get("rl5_turns")
    if first_pct is None or pct < first_pct or first_turns is None:
        state["rl5_pct"], state["rl5_turns"] = pct, turns
        return None
    dt, dp = turns - first_turns, pct - first_pct
    if dt < 5 or dp <= 0:  # too few samples to extrapolate honestly
        return None
    return int((100 - pct) / (dp / dt))


def bar(pct, width=12):
    pct = max(0.0, min(100.0, pct or 0.0))
    filled = int(round(width * pct / 100.0))
    return "▕" + "█" * filled + "░" * (width - filled) + "▏"


def resets_in(epoch):
    if not epoch:
        return None
    secs = int(epoch - time.time())
    if secs <= 0:
        return "now"
    if secs > 8 * 86400:  # no real limit window is longer; treat as bad data
        return None
    h, m = secs // 3600, (secs % 3600) // 60
    return f"{h}h{m:02d}m" if h else f"{m}m"


def main():
    try:
        d = json.load(sys.stdin)
    except Exception:
        print("")
        return

    ctx = dig(d, "context_window", "total_input_tokens")
    window = dig(d, "context_window", "context_window_size", default=200_000)
    used_pct = dig(d, "context_window", "used_percentage", default=0)
    model = dig(d, "model", "display_name", default="claude")
    proj = os.path.basename(
        dig(d, "workspace", "current_dir", default=dig(d, "cwd", default="")) or ""
    )
    cost = dig(d, "cost", "total_cost_usd")
    sid = dig(d, "session_id")
    turns = dig(d, "prompt_cache", "requests")

    state = load_state(sid)

    left = [c(model, BLUE)]
    if proj:
        left.append(c(proj, DIM))

    warning = None

    if ctx:
        tone = GREEN if ctx < WARN else (AMBER if ctx < HIGH else RED)
        # weighted cost of one turn's cache re-read (cache reads bill at 0.1x)
        per_turn = ctx * 0.1
        seg = f"{bar(used_pct)} {human(ctx)}"
        left.append(c(seg, tone))
        left.append(c(f"{human(int(per_turn))}/turn", tone))

        lo = baseline(state, ctx)
        if lo and ctx >= lo * 1.5:
            left.append(c(f"{ctx / lo:.1f}×", tone))

        if used_pct and used_pct >= FULL_PCT:
            warning = (
                f"context {used_pct:.0f}% full — /compact to keep this thread, "
                f"/clear to start fresh"
            )
        elif ctx >= HIGH:
            extra = f" ({ctx / lo:.1f}× its cheapest)" if lo and lo < ctx else ""
            warning = (
                f"{human(ctx)} context{extra} — every turn now costs "
                f"{human(int(per_turn))} before you type. /clear if you have "
                f"switched task, /compact to keep going"
            )
    else:
        left.append(c("ctx —", GREY))

    if turns:
        left.append(c(f"{turns}t", GREY))

    # rate limits: on a subscription this IS the budget, not the dollar estimate
    for key, label in (("five_hour", "5h"), ("seven_day", "7d")):
        pct = dig(d, "rate_limits", key, "used_percentage")
        if pct is None:
            continue
        tone = GREEN if pct < 50 else (AMBER if pct < 80 else RED)
        txt = f"{label} {pct:.0f}%"
        rst = resets_in(dig(d, "rate_limits", key, "resets_at"))
        if rst and pct >= 50:
            txt += f"↻{rst}"
        if key == "five_hour":
            burn = rate_burn(state, pct, turns)
            if burn is not None and burn < 200:
                txt += f" ~{burn}t left"
                if burn < 15:
                    tone = RED
        left.append(c(txt, tone))

    # wasted cache rebuilds: real money, invisible otherwise
    misses = dig(d, "prompt_cache", "misses")
    if misses:
        wasted = dig(d, "prompt_cache", "miss_recache_tokens")
        cause = dig(d, "prompt_cache", "last_miss_cause", "causes", default=[])
        bit = f"⚠ {misses} cache miss"
        if wasted:
            bit += f" ({human(wasted)} rebuilt)"
        if cause:
            bit += f" {cause[0]}"
        left.append(c(bit, AMBER))

    # Off by default: on a Claude subscription this is a client-side estimate at
    # API list price, not money anyone pays. The rate-limit percentages above are
    # the real budget. Set CC_SHOW_COST=1 when billing through an API key.
    if cost and os.environ.get("CC_SHOW_COST"):
        left.append(c(f"${cost:.2f}", GREY))

    save_state(sid, state)
    print(c(" · ", GREY).join(left))
    if warning:
        print(c(f"⚠  {warning}", RED if ctx >= HIGH else AMBER))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # a broken status line must never break the session
        print(f"statusline error: {type(e).__name__}", file=sys.stderr)
        print("")


# ---------------------------------------------------------------------------
# Install:  ./install.sh          (see README.md for manual setup and Windows)
# Tune:     CC_CTX_WARN, CC_CTX_HIGH, CC_CTX_FULL_PCT, CC_SHOW_COST, NO_COLOR
# ---------------------------------------------------------------------------
