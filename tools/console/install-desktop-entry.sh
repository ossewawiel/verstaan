#!/usr/bin/env bash
# SPDX-License-Identifier: MPL-2.0
# Writes the Verstaan Console launcher entry, so SUPER+SPACE finds "Verstaan Console" beside every
# other app instead of the console living only in a terminal (issue 170). Linux only: it writes a
# freedesktop .desktop file under $XDG_DATA_HOME/applications (or ~/.local/share/applications).
#
# Resolves this checkout's own path -- the repository can be cloned or worktreed anywhere, so the
# entry names this checkout's console.sh and icon, never a hard-coded path. Safe to run twice: it
# rewrites the same file with the same content.
#
# The entry's Exec line passes --app-window to console.sh, which starts the service if it is down,
# waits for /health, then opens a Chromium app window: no tab strip, no address bar. That window
# reports the app_id "chrome-127.0.0.1__7864-Default" to the window manager, not the desktop
# entry's name, so StartupWMClass below is set to exactly that string -- otherwise Hyprland cannot
# match the window to this entry's icon, and the taskbar and alt-tab list show a generic Chromium
# icon instead.
set -eu

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
console_sh="$repo_root/console.sh"
icon="$script_dir/verstaan-console.svg"

[ -f "$console_sh" ] || { echo "install-desktop-entry: $console_sh not found" >&2; exit 1; }
[ -f "$icon" ] || { echo "install-desktop-entry: $icon not found" >&2; exit 1; }

data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
target_dir="$data_home/applications"
target="$target_dir/verstaan-console.desktop"

mkdir -p "$target_dir"

cat > "$target" <<ENTRY
[Desktop Entry]
Version=1.0
Type=Application
Name=Verstaan Console
Comment=Start the Verstaan factory console and open it in its own window
Exec="$console_sh" --app-window
Icon=$icon
Terminal=false
Categories=Development;
StartupWMClass=chrome-127.0.0.1__7864-Default
StartupNotify=true
ENTRY

echo "install-desktop-entry: wrote $target"
