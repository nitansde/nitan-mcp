#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILL_DIR="$ROOT_DIR/skills/nitan"
DIST_DIR="$ROOT_DIR/dist-skill"
OUT_FILE="$DIST_DIR/nitan.skill"

mkdir -p "$DIST_DIR"
rm -f "$OUT_FILE"

(
  cd "$ROOT_DIR/skills"
  # Create .skill (zip format with .skill extension)
  zip -r "$OUT_FILE" "nitan" -x "*.DS_Store"
)

echo "Packed skill: $OUT_FILE"
