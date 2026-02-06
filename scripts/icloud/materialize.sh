#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "iCloud dataless materialize: not macOS (skipping)."
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

max_passes=10
retries=5
rsync_timeout_seconds=30
paths=()

for arg in "$@"; do
  case "$arg" in
    --passes=*)
      max_passes="${arg#--passes=}"
      ;;
    --retries=*)
      retries="${arg#--retries=}"
      ;;
    --rsync-timeout=*)
      rsync_timeout_seconds="${arg#--rsync-timeout=}"
      ;;
    --path=*)
      paths+=("${arg#--path=}")
      ;;
    --help|-h)
      cat <<'EOF'
Usage: bash scripts/icloud/materialize.sh [--passes=N] [--retries=N] [--rsync-timeout=SECONDS]

Attempts to force-download and "materialize" iCloud Drive dataless files on macOS
by copying each dataless file to a temp location and copying it back.

This is a best-effort workaround for iCloud "Optimize Mac Storage" placeholders
that break git/build tooling.

Recommended human fix:
- Move the repo out of iCloud Drive, or
- Finder: right click the repo folder -> "Download Now"

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
  {
    if [[ "${#paths[@]}" -gt 0 ]]; then
      git ls-files --cached --others --exclude-standard -z -- "${paths[@]}" \
        | xargs -0 stat -f '%N%t%Sf' 2>/dev/null || true
    else
      git ls-files --cached --others --exclude-standard -z \
        | xargs -0 stat -f '%N%t%Sf' 2>/dev/null || true
    fi
  } | awk -F $'\t' '$2 ~ /dataless/ {print $1}'
}

tmp_root="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_root" >/dev/null 2>&1 || true
}
trap cleanup EXIT

pass=1
while [[ "$pass" -le "$max_passes" ]]; do
  dataless_paths="$(find_dataless_paths)"
  dataless_count="$(printf '%s\n' "$dataless_paths" | sed '/^$/d' | wc -l | tr -d ' ')"

  if [[ "$dataless_count" == "0" ]]; then
    echo "Materialize pass $pass: OK (0 dataless files)."
    break
  fi

  echo "Materialize pass $pass: $dataless_count dataless files"

  ok=0
  still=0
  failed=0

  while IFS= read -r path; do
    [[ -z "$path" ]] && continue

    src="$path"
    rel="${src#./}"
    tmp_path="$tmp_root/$rel"

    mkdir -p "$(dirname "$tmp_path")"

    attempt=1
    copied=false
    while [[ "$attempt" -le "$retries" ]]; do
      if rsync -a --timeout="$rsync_timeout_seconds" -- "$src" "$tmp_path" >/dev/null 2>&1 \
        && rsync -a --timeout="$rsync_timeout_seconds" -- "$tmp_path" "$src" >/dev/null 2>&1; then
        copied=true
        break
      fi
      sleep "0.$((attempt * 5))"
      attempt="$((attempt + 1))"
    done

    if [[ "$copied" != "true" ]]; then
      failed="$((failed + 1))"
      continue
    fi

    flags="$(stat -f '%Sf' "$src" 2>/dev/null || true)"
    if [[ "$flags" == *dataless* ]]; then
      still="$((still + 1))"
    else
      ok="$((ok + 1))"
    fi
  done <<< "$dataless_paths"

  echo "Materialize pass $pass summary: ok=$ok still_dataless=$still failed=$failed"

  pass="$((pass + 1))"
done

check_args=(--max=20)
if [[ "${#paths[@]}" -gt 0 ]]; then
  for path in "${paths[@]}"; do
    check_args+=("--path=$path")
  done
fi

bash scripts/icloud/check.sh "${check_args[@]}"
