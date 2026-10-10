#!/bin/bash
# Runs as user: Xvfb at a fixed size, a dbus session, the seeded keyring, then Claude Desktop.
# Extra arguments go to claude-desktop (for example --no-sandbox).
export DISPLAY=:99
Xvfb :99 -screen 0 ${SCREEN:-1440x900x24} -nolisten tcp >/tmp/xvfb.log 2>&1 &
for i in $(seq 1 100); do xdpyinfo >/dev/null 2>&1 && break; sleep 0.05; done
eval "$(dbus-launch --sh-syntax)"
echo "export DBUS_SESSION_BUS_ADDRESS='$DBUS_SESSION_BUS_ADDRESS'" > /tmp/dbus.env
echo -n '' | gnome-keyring-daemon --unlock --components=secrets >/tmp/keyring.log 2>&1
exec claude-desktop "$@" >/tmp/desktop.log 2>&1
