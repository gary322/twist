#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "iCloud dataless preflight: not macOS (skipping)."
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

max_list=50
for arg in "$@"; do
  case "$arg" in
    --max=*)
      max_list="${arg#--max=}"
      ;;
    --help|-h)
      cat <<'EOF'
Usage: bash scripts/icloud/check.sh [--max=N]

Detect iCloud Drive "dataless" files on macOS. These placeholders can cause:
- git indexing failures ("short read while indexing")
- build/test failures (timeouts reading files)

Exit codes:
  0: no dataless files detected (in scanned paths)
  1: dataless files detected
EOF
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

find_dataless_paths() {
  # Only scan files that git would see (tracked + untracked non-ignored). This avoids
  # spending time/materializing files intentionally excluded by `.gitignore`.
  #
  # Use BSD `stat` to print: "<path><TAB><flags>" and filter for "dataless".
  {
    git ls-files --cached --others --exclude-standard -z \
      | xargs -0 stat -f '%N%t%Sf' 2>/dev/null || true
  } | awk -F $'\t' '$2 ~ /dataless/ {print $1}'
}

dataless_paths="$(find_dataless_paths)"
dataless_count="$(printf '%s\n' "$dataless_paths" | sed '/^$/d' | wc -l | tr -d ' ')"

if [[ "$dataless_count" == "0" ]]; then
  echo "iCloud dataless preflight: OK (0 files)."
  exit 0
fi

echo "iCloud dataless preflight: FAIL ($dataless_count files)."
echo "Run: bash scripts/icloud/materialize.sh"
echo
echo "Sample:"
printf '%s\n' "$dataless_paths" | sed '/^$/d' | head -n "$max_list"
if [[ "$dataless_count" -gt "$max_list" ]]; then
  echo "... (+$((dataless_count - max_list)) more)"
fi

exit 1
