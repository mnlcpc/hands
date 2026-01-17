#!/bin/bash

# Async - HITL mode: run one iteration

# Capture the project directory (where the user is running from)
PROJECT_DIR="$(pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"

# Find where the script lives (to get ASYNC_INSTRUCTION.md)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTRUCTIONS_PATH="$SCRIPT_DIR/ASYNC_INSTRUCTION.md"

# Ensure we're in the project directory
cd "$PROJECT_DIR" || exit 1

echo ""
echo "=========================================="
echo "  ASYNC - HITL MODE"
echo "  Project: $PROJECT_NAME"
echo "  Path: $PROJECT_DIR"
echo "=========================================="
echo ""

claude --permission-mode acceptEdits "$(cat "$INSTRUCTIONS_PATH")"
