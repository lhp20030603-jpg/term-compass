#!/bin/sh
# Pre-commit checks for a plain-JS project: build, syntax, tests, secrets, stray debugging.
set -e
cd "$(dirname "$0")"
node build.js >/dev/null
node --check main.js
T=$(node --test "tests/*.test.js" 2>&1 | grep -E "^ℹ (pass|fail)" | tr '\n' ' ')
S=$(git diff --cached -- . ':!verify.sh' | grep -E '^\+' | grep -cE "sk-[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{12,}|-----BEGIN" || true)
D=$(cat src/*/*.js | grep -cE "console\.log|debugger" || true)
echo "VERIFICATION  tests=[$T] secrets=$S debug=$D"
echo "$T" | grep -q "fail 0" && [ "$S" = 0 ] && [ "$D" = 0 ] && echo "Ready for commit: YES" || { echo "Ready for commit: NO"; exit 1; }
