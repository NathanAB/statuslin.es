#!/usr/bin/env python3
"""Starfield Terminal: Claude Code statusline; JSON on stdin. No network calls."""
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import unicodedata

# Palette: ice cyan, apricot, silver white, cool slate
CYAN = '\033[38;2;143;229;239m'
APRICOT = '\033[38;2;245;191;138m'
WHITE = '\033[38;2;237;241;245m'
MUTED = '\033[38;2;135;152;171m'
RESET = '\033[0m'
MARKS = ['🥐', '🍳', '☕', '🚀', '✨', '🔮']


def width(s):
    total = 0
    for ch in s:
        if unicodedata.combining(ch) or unicodedata.category(ch) in ('Cf', 'Mn', 'Me'):
            continue
        total += 2 if (unicodedata.east_asian_width(ch) in ('W', 'F') or ord(ch) >= 0x1F300) else 1
    return total


def shorten(s, limit):
    s = str(s).replace('\n', ' ').replace('\r', ' ').strip()
    if width(s) <= limit:
        return s
    out = ''
    for ch in s:
        if width(out + ch) > max(0, limit - 1):
            break
        out += ch
    return out + '…'


def machine_label():
    """Fallback identity when config.json has no status_label.

    macOS reports the friendly ComputerName from System Settings; elsewhere the
    hostname without its domain is used. Returned verbatim — a machine called
    'MacBook Pro' should read like that, not like a shouting brand.
    """
    host = ''
    if sys.platform == 'darwin':
        try:
            proc = subprocess.run(
                ['scutil', '--get', 'ComputerName'],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, timeout=0.5, check=False
            )
            host = proc.stdout.strip()
        except Exception:
            host = ''
    if not host:
        try:
            host = socket.gethostname().split('.')[0].strip()
        except OSError:
            return 'STARFIELD'
    return host or 'STARFIELD'


try:
    d = json.load(sys.stdin)
except Exception:
    d = {}

try:
    config_file = Path.home() / '.config' / 'starfield-terminal' / 'config.json'
    config = json.loads(config_file.read_text(encoding='utf-8')) if config_file.exists() else {}
    if not isinstance(config, dict):
        config = {}
except (OSError, ValueError):
    config = {}

session = str(d.get('session_id') or 'default')
mark = MARKS[int(hashlib.sha256(session.encode()).hexdigest(), 16) % len(MARKS)]
work = d.get('workspace') or {}
current_dir = work.get('current_dir') or d.get('cwd') or str(Path.home())
project_name = Path(current_dir).name or '~'
if Path(current_dir).expanduser() == Path.home():
    project_name = '~'

model_data = d.get('model') or {}
model_raw = str(model_data.get('display_name') or model_data.get('id') or '--')
# Provider names in parenthesis add length but not useful model information.
model_raw = model_raw.replace('（OpenRouter）', '').replace(' (OpenRouter)', '')

# An unrecognized OpenRouter model may be assigned an assumed 200k context.
# Do not imply precision for custom gateway context windows.
model_id = str(model_data.get('id') or '').lower()
is_gateway = 'openrouter' in model_id or 'openrouter' in str(model_data.get('display_name') or '').lower() or model_id.startswith('ccs-')
ctx_data = d.get('context_window') or {}
pct = ctx_data.get('used_percentage')
ctx_text = '--'
if isinstance(pct, (int, float)) and not isinstance(pct, bool) and 0 <= pct <= 100:
    # Custom gateway model window sizes can be assumed by Claude Code.
    # The tilde explicitly marks provider-dependent percentages as estimates.
    ctx_text = f'~{pct:.0f}%' if is_gateway else f'{pct:.0f}%'

try:
    proc = subprocess.run(
        ['git', '-C', str(current_dir), 'branch', '--show-current'],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, timeout=0.75, check=False
    )
    branch = proc.stdout.strip()
except Exception:
    branch = ''

try:
    cols = int(os.environ.get('COLUMNS', '88'))
except ValueError:
    cols = 88
cols = max(35, cols)

# Line 1: identity + current project + git branch. Limit all values.
branch = shorten(branch, 15)
status_label = shorten(config.get('status_label') or machine_label(), 24)
identity = f'{mark}  {status_label}'
project_label = 'PROJECT'
git_suffix = f'  ·  GIT {branch}' if branch else ''
max_project = max(8, cols - width(identity) - width(project_label) - width(git_suffix) - 8)
project = shorten(project_name, min(26, max_project))
if width(identity) + width(project_label) + width(project) + width(git_suffix) + 6 > cols:
    git_suffix = ''
line1 = (f'{WHITE}{mark}{RESET}  {CYAN}{status_label}{RESET}'
         f'  {MUTED}│ PROJECT{RESET}  {WHITE}{project}{RESET}'
         + (f'{MUTED}{git_suffix}{RESET}' if git_suffix else ''))

# Line 2: model, then context; keep right-hand label legible on narrow splits.
model_limit = max(8, min(38, cols - 25))
model = shorten(model_raw, model_limit)
line2 = (f'{MUTED}MODEL{RESET}  {WHITE}{model}{RESET}'
         f'  {MUTED}│  CTX{RESET}  {APRICOT}{ctx_text}{RESET}')

print(line1)
print(line2)
# U+2800 BRAILLE PATTERN BLANK renders as nothing but is not whitespace, so the
# host keeps this spacer line instead of trimming it away.
print('⠀')
