#!/usr/bin/env bash
#
# Interactive task picker (run via `task start`).
#
# Edit MENU below to control what shows up — just the tasks you actually run.
# Descriptions are pulled from the Taskfile itself, so they never drift. Anything
# not listed here is still runnable directly with `task <name>` (and shows in
# `task --list`).
#
set -uo pipefail

MENU=(
  docs:dev      # work on the docs site (auto-regenerates reference pages)
  docs:gen      # regenerate reference pages after editing src/
  docs:build    # build the static site + llms.txt
  build         # build the postgresdk lib + CLI
  test          # run the test suite
  typecheck     # typecheck the lib
)

# Map task name -> description, straight from the Taskfile (keeps descriptions DRY).
declare -A DESC
while IFS=$'\t' read -r n d; do
  DESC["$n"]="$d"
done < <(
  task --list-all --json | bun -e '
    const d = JSON.parse(await Bun.stdin.text());
    for (const t of (d.tasks ?? [])) console.log(t.name + "\t" + (t.desc ?? ""));
  '
)

names=()
displays=()
for name in "${MENU[@]}"; do
  [[ -v "DESC[$name]" ]] || continue # skip anything that no longer exists
  names+=("$name")
  displays+=("$(printf '%-14s %s' "$name" "${DESC[$name]}")")
done

if [ "${#names[@]}" -eq 0 ]; then
  echo "No matching tasks — check the MENU list in scripts/task-menu.sh." >&2
  exit 1
fi

echo
echo "What do you want to run?"
echo
PS3=$'\n> Pick a number (Ctrl-C to cancel): '
select _ in "${displays[@]}"; do
  if [[ -n "${REPLY//[0-9]/}" || -z "$REPLY" ]] || (( REPLY < 1 || REPLY > ${#names[@]} )); then
    echo "Invalid choice — try again."
    continue
  fi
  sel="${names[REPLY-1]}"
  echo
  echo "▶ task $sel"
  echo
  exec task "$sel"
done

echo
echo "Cancelled."
exit 0
