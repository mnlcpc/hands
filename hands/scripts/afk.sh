#!/bin/bash
set -e

# Async - AFK mode: run in loop until complete or max iterations

# Capture the project directory (where the user is running from)
PROJECT_DIR="$(pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"

# Find where the script lives (to get ASYNC_INSTRUCTION.md)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTRUCTIONS_PATH="$SCRIPT_DIR/ASYNC_INSTRUCTION.md"

if [ -z "$1" ]; then
  echo "Usage: $0 <max-iterations>"
  echo "Example: $0 15"
  echo ""
  echo "Run this from inside your project folder."
  exit 1
fi

MAX="$1"

# Ensure we're in the project directory
cd "$PROJECT_DIR" || exit 1

echo ""
echo "=========================================="
echo "  ASYNC - AFK MODE"
echo "  Project: $PROJECT_NAME"
echo "  Path: $PROJECT_DIR"
echo "  Max iterations: $MAX"
echo "=========================================="

for ((i=1; i<=MAX; i++)); do
  echo ""
  echo "=========================================="
  echo "  ITERATION $i / $MAX"
  echo "=========================================="
  echo ""

  result=$(claude --permission-mode acceptEdits -p "$(cat "$INSTRUCTIONS_PATH")")

  echo "$result"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo ""
    echo "=========================================="
    echo "  ✅ COMPLETE after $i iterations"
    echo "  Project: $PROJECT_NAME"
    echo "=========================================="
    exit 0
  fi
done

echo ""
echo "=========================================="
echo "  ⚠️  MAX ITERATIONS reached ($MAX)"
echo "  Project: $PROJECT_NAME"
echo "  Manual review needed"
echo "=========================================="
exit 1
