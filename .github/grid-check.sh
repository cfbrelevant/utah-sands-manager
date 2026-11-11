#!/usr/bin/env bash
# THE GRID's standard check. AI pull requests ship on their own once this passes, so it checks what the repo
# actually contains (in the pull request itself), including projects in subfolders, and only reports what it
# really checked:
#  - Node project (package.json): install, then typecheck, build and test (each only if defined).
#  - Godot project (project.godot): open it headless with the matching Godot 4 and fail on script/scene errors.
#  - Android/Gradle project with a Gradle wrapper: ./gradlew build.
#  - Everything else: every JavaScript file must parse and every HTML page must be a real page.
#  - Docs only (none of the above): passes and says there is no code to check.
set -euo pipefail
NPM="${GRID_NPM:-npm}"
ROOT=$(pwd)
checked=()
SKIP='-path */node_modules -o -path */.git -o -path */.godot -o -path */.next -o -path */dist -o -path */build -o -path */.gradle'

# Project folders up to 3 levels deep (outermost wins for Node, so a package's own subfolders aren't re-run).
mapfile -t NODE < <(eval "find . \\( $SKIP \\) -prune -o -maxdepth 3 -name package.json -print" | xargs -r -n1 dirname | sort | awk 'BEGIN{p="\001"} index($0, p"/")!=1 {print; p=$0}')
mapfile -t GODOT < <(eval "find . \\( $SKIP \\) -prune -o -maxdepth 3 -name project.godot -print" | xargs -r -n1 dirname | sort)
mapfile -t GRADLE < <(eval "find . \\( $SKIP \\) -prune -o -maxdepth 3 \\( -name settings.gradle -o -name settings.gradle.kts \\) -print" | xargs -r -n1 dirname | sort -u)

for d in "${NODE[@]}"; do
  echo "== Node project: $d"
  ( cd "$d"
    if [ -f package-lock.json ]; then $NPM ci --no-audit --no-fund; else $NPM install --no-audit --no-fund; fi
    for s in typecheck build test; do
      cmd=$(node -p "((require('./package.json').scripts)||{})['$s']||''")
      case "$cmd" in
        ""|*"no test specified"*) echo "· no $s script, skipped" ;;
        *) echo "== $d: npm run $s"; $NPM run "$s" ;;
      esac
    done )
  checked+=("node:$d")
done

godot_bin=""
for d in "${GODOT[@]}"; do
  ver=$(grep -oE 'config/features=PackedStringArray\("[0-9]+\.[0-9]+(\.[0-9]+)?' "$d/project.godot" | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' || true)
  ver=${ver:-4.3}
  echo "== Godot $ver project: $d (open headless, look for script and scene errors)"
  tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/godot.zip" "https://github.com/godotengine/godot/releases/download/${ver}-stable/Godot_v${ver}-stable_linux.x86_64.zip"
  unzip -q "$tmp/godot.zip" -d "$tmp"
  godot_bin=$(find "$tmp" -maxdepth 1 -type f -name 'Godot_v*' | head -1); chmod +x "$godot_bin"
  timeout 600 "$godot_bin" --headless --path "$d" --import > "$tmp/log.txt" 2>&1 || true
  grep -q "Godot Engine v" "$tmp/log.txt" || { tail -20 "$tmp/log.txt"; echo "::error::Godot did not start for $d"; exit 1; }
  if grep -qE 'SCRIPT ERROR|Parse Error|Failed to load script|Cannot open file|Failed loading resource' "$tmp/log.txt"; then
    grep -E 'SCRIPT ERROR|Parse Error|Failed to load script|Cannot open file|Failed loading resource' -A2 "$tmp/log.txt" | head -40
    echo "::error::Godot reported errors in $d"; exit 1
  fi
  echo "· $d opened with no script or scene errors"
  checked+=("godot:$d")
done

for d in "${GRADLE[@]}"; do
  if [ -f "$d/gradlew" ]; then
    echo "== Gradle build: $d"; ( cd "$d" && chmod +x gradlew && ./gradlew --no-daemon build ); checked+=("gradle:$d")
  else
    echo "· $d is a Gradle project without a Gradle wrapper (gradlew): nothing to build yet"
  fi
done

# Plain JavaScript and HTML outside the Node projects above.
nodeprune=""
for d in "${NODE[@]}"; do nodeprune="$nodeprune -o -path ${d}"; done
tmp=$(mktemp -d); n=0; h=0
while IFS= read -r -d '' f; do
  n=$((n+1))
  if ! node --check "$f" 2>/dev/null; then
    cp "$f" "$tmp/check.mjs"
    node --check "$tmp/check.mjs" || { echo "::error file=$f::JavaScript syntax error"; exit 1; }
  fi
done < <(eval "find . \\( $SKIP $nodeprune \\) -prune -o -type f \\( -name '*.js' -o -name '*.mjs' \\) -print0")
while IFS= read -r -d '' f; do
  h=$((h+1))
  grep -qiE '<(!doctype html|html|body|head)' "$f" || { echo "::error file=$f::not an HTML page"; exit 1; }
done < <(eval "find . \\( $SKIP $nodeprune \\) -prune -o -type f -name '*.html' -print0")
[ "$n" -gt 0 ] && { echo "· $n JavaScript file(s) parse"; checked+=("javascript"); }
[ "$h" -gt 0 ] && { echo "· $h HTML page(s) look right"; checked+=("html"); }

cd "$ROOT"
if [ ${#checked[@]} -eq 0 ]; then
  echo "· No code here yet (docs only), so there is nothing to check. Code added later is checked automatically."
else
  echo "Checked: ${checked[*]}"
fi
echo "GRID check passed"
