#!/usr/bin/env bash
# Re-download Quaternius Post Apocalypse + Ultimate Monsters GLBs used by Gate Runner (CC0).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/assets/gltf"
mkdir -p "$DEST"
MANIFEST="$DEST/manifest.json"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing $MANIFEST — cannot resolve URLs." >&2
  exit 1
fi

python3 - <<PY
import json, urllib.request
from pathlib import Path
dest = Path("$DEST")
manifest = json.loads(Path("$MANIFEST").read_text())
for item in manifest:
    url = item.get("src")
    fname = item.get("file")
    if not url or not fname:
        continue
    out = dest / fname
    print("GET", fname)
    req = urllib.request.Request(url, headers={"User-Agent": "casual-samegame-gate-runner/1.0"})
    data = urllib.request.urlopen(req, timeout=120).read()
    out.write_bytes(data)
    print(" ", len(data), "bytes")
print("Done.")
PY
