#!/bin/bash
# OpenSpec Agent Loop
# Usage: ./loop.sh <change-name> [max-iterations]

set -e

CHANGE_NAME="${1:?Usage: ./loop.sh <change-name> [max-iterations]}"
MAX_ITERATIONS="${2:-20}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/prompt.md"
LEARNINGS_FILE="$SCRIPT_DIR/learnings.md"

[ ! -f "$LEARNINGS_FILE" ] && echo "# Agent Learnings" > "$LEARNINGS_FILE"

echo "OpenSpec Loop: change=$CHANGE_NAME, max=$MAX_ITERATIONS"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "=== Iteration $i/$MAX_ITERATIONS ==="

  # Pre-check: already complete?
  REMAINING=$(openspec instructions apply --change "$CHANGE_NAME" --json 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['progress']['remaining'])")
  if [ "$REMAINING" = "0" ]; then
    echo "All tasks complete."
    exit 0
  fi

  # Build combined prompt: autonomous instructions + learnings
  COMBINED=$(mktemp)
  cat "$PROMPT_FILE" > "$COMBINED"
  echo -e "\n\n---\n\n# Learnings From Previous Iterations\n" >> "$COMBINED"
  cat "$LEARNINGS_FILE" >> "$COMBINED"

  # Run headless claude
  OUTPUT=$(claude \
    --print \
    --dangerously-skip-permissions \
    --append-system-prompt "CHANGE_NAME=$CHANGE_NAME" \
    < "$COMBINED" \
    2>&1 | tee /dev/stderr) || true

  rm -f "$COMBINED"

  # Extract and append learnings
  LEARNINGS=$(echo "$OUTPUT" | sed -n '/<learnings>/,/<\/learnings>/p' | sed '1d;$d')
  [ -n "$LEARNINGS" ] && { echo ""; echo "$LEARNINGS"; } >> "$LEARNINGS_FILE"

  # Check completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo "Complete at iteration $i."
    exit 0
  fi

  sleep 2
done

echo "Reached max iterations ($MAX_ITERATIONS)."
exit 1
