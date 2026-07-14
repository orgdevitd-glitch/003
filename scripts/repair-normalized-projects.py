"""One-shot repair for truncated data/normalized-projects.json."""
from __future__ import annotations

import json
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "data" / "normalized-projects.json"
text = path.read_text(encoding="utf-8", errors="replace")

last_good = -1
depth = 0
in_str = False
esc = False

for i, ch in enumerate(text):
    if in_str:
        if esc:
            esc = False
        elif ch == "\\":
            esc = True
        elif ch == '"':
            in_str = False
        continue
    if ch == '"':
        in_str = True
        continue
    if ch in "[{":
        depth += 1
    elif ch == "}":
        depth -= 1
        if depth == 1:
            last_good = i
    elif ch == "]":
        depth -= 1

if last_good < 0:
    raise SystemExit("Could not find a complete top-level object to truncate to")

repaired = text[: last_good + 1] + "]"
arr = json.loads(repaired)
path.write_text(json.dumps(arr, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"Repaired {path.name}: {len(arr)} projects")
