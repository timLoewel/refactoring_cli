#!/bin/bash
# OpenSpec Agent Loop
# Usage: ./loop.sh <change-name> [max-iterations]

set -e

cleanup() {
  rm -f "$COMBINED" "$OUTPUT_FILE"
  echo ""
  echo "Loop interrupted."
  exit 130
}
trap cleanup INT TERM

CHANGE_NAME="${1:?Usage: ./loop.sh <change-name> [max-iterations]}"
MAX_ITERATIONS="${2:-20}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="$SCRIPT_DIR/prompt.md"
LEARNINGS_FILE="$SCRIPT_DIR/learnings.md"

[ ! -f "$LEARNINGS_FILE" ] && echo "# Agent Learnings" > "$LEARNINGS_FILE"

echo "OpenSpec Loop: change=$CHANGE_NAME, max=$MAX_ITERATIONS"

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "=== Iteration $i/$MAX_ITERATIONS === $(date '+%H:%M:%S')"

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

  # Run headless claude with JSON output to capture session ID
  OUTPUT_FILE=$(mktemp)
  claude \
    --print \
    --dangerously-skip-permissions \
    --output-format json \
    --append-system-prompt "CHANGE_NAME=$CHANGE_NAME" \
    < "$COMBINED" \
    > "$OUTPUT_FILE" 2>&1 || true

  # Parse JSON result
  OUTPUT=$(python3 -c "
import sys, json
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('result', ''))
except: pass
" "$OUTPUT_FILE")
  SESSION_ID=$(python3 -c "
import sys, json
try:
    d = json.load(open(sys.argv[1]))
    print(d.get('session_id', ''))
except: pass
" "$OUTPUT_FILE")

  rm -f "$COMBINED" "$OUTPUT_FILE"

  # Show result text
  echo "$OUTPUT"

  # Extract and append learnings with session link
  LEARNINGS=$(echo "$OUTPUT" | sed -n '/<learnings>/,/<\/learnings>/p' | sed '1d;$d')
  if [ -n "$LEARNINGS" ]; then
    { echo ""; echo "Session: \`claude --resume $SESSION_ID\`"; echo "$LEARNINGS"; } >> "$LEARNINGS_FILE"
  fi

  # Check completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo "Complete at iteration $i."
    exit 0
  fi

  sleep 2
done

echo "Reached max iterations ($MAX_ITERATIONS)."
exit 1
