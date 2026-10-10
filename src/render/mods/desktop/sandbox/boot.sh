#!/bin/bash
# Runs as user: Xvfb on $DISPLAY at $SCREEN, a dbus session, the seeded empty keyring Electron keeps
# its secrets in, then Claude Desktop. Arguments go to claude-desktop.
set -u
Xvfb "$DISPLAY" -screen 0 "$SCREEN" -nolisten tcp >/tmp/xvfb.log 2>&1 &
for _ in $(seq 1 100); do xdpyinfo >/dev/null 2>&1 && break; sleep 0.05; done
eval "$(dbus-launch --sh-syntax)"
echo "export DBUS_SESSION_BUS_ADDRESS='$DBUS_SESSION_BUS_ADDRESS'" >/tmp/dbus.env
echo -n '' | gnome-keyring-daemon --unlock --components=secrets >/tmp/keyring.log 2>&1
exec claude-desktop "$@" >/tmp/desktop.log 2>&1
