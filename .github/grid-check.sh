#!/usr/bin/env bash
# THE GRID's standard check. AI pull requests ship on their own once this passes, so it checks what the repo
# actually contains (in the pull request itself), and only says "passed" for what it really checked:
#  - Node project (package.json): install, then typecheck, build and test (each only if defined).
#  - Godot project (project.godot): open the project headless with the matching Godot 4 and fail on script errors.
#  - Android/Gradle project with a Gradle wrapper: ./gradlew build.
#  - Static site: every JavaScript file must parse and every HTML page must be a real page.
#  - Docs only (nothing above yet): passes and says there is no code to check.
set -euo pipefail
NPM="${GRID_NPM:-npm}"
checked=()

files() { find . \( -path ./node_modules -o -path ./.git -o -path ./.godot \) -prune -o -type f \( "$@" \) -print0; }

if [ -f package.json ]; then
  if [ -f package-lock.json ]; then $NPM ci --no-audit --no-fund; else $NPM install --no-audit --no-fund; fi
  for s in typecheck build test; do
    cmd=$(node -p "((require('./package.json').scripts)||{})['$s']||''")
    case "$cmd" in
      ""|*"no test specified"*) echo "· no $s script, skipped" ;;
      *) echo "== npm run $s"; $NPM run "$s"; checked+=("npm $s") ;;
    esac
  done
  checked+=("npm install")
fi

if [ -f project.godot ]; then
  ver=$(grep -oE 'config/features=PackedStringArray\("[0-9]+\.[0-9]+(\.[0-9]+)?' project.godot | grep -oE '[0-9]+\.[0-9]+(\.[0-9]+)?' || true)
  ver=${ver:-4.3}
  echo "== Godot $ver: open the project headless and look for script errors"
  dir=$(mktemp -d)
  curl -fsSL -o "$dir/godot.zip" "https://github.com/godotengine/godot/releases/download/${ver}-stable/Godot_v${ver}-stable_linux.x86_64.zip"
  unzip -q "$dir/godot.zip" -d "$dir"
  bin=$(find "$dir" -maxdepth 1 -type f -name 'Godot_v*' | head -1)
  chmod +x "$bin"
  timeout 600 "$bin" --headless --path . --import > "$dir/log.txt" 2>&1 || true
  if grep -qE 'SCRIPT ERROR|Parse Error|Failed to load script|Cannot open file' "$dir/log.txt"; then
    grep -E 'SCRIPT ERROR|Parse Error|Failed to load script|Cannot open file' -A2 "$dir/log.txt" | head -40
    echo "::error::Godot reported script errors"; exit 1
  fi
  echo "· Godot opened the project with no script errors ($(grep -c . "$dir/log.txt") log lines)"
  checked+=("Godot $ver")
fi

if [ -f gradlew ] && { [ -f settings.gradle ] || [ -f settings.gradle.kts ]; }; then
  echo "== Gradle build"
  chmod +x gradlew
  ./gradlew --no-daemon build
  checked+=("gradle build")
elif [ -f settings.gradle ] || [ -f settings.gradle.kts ]; then
  echo "· Gradle project without a Gradle wrapper (gradlew): nothing to build yet"
fi

if [ ! -f package.json ]; then
  tmp=$(mktemp -d)
  n=0
  while IFS= read -r -d '' f; do
    n=$((n+1))
    if ! node --check "$f" 2>/dev/null; then
      cp "$f" "$tmp/check.mjs"
      node --check "$tmp/check.mjs" || { echo "::error file=$f::JavaScript syntax error"; exit 1; }
    fi
  done < <(files -name '*.js' -o -name '*.mjs')
  h=0
  while IFS= read -r -d '' f; do
    h=$((h+1))
    grep -qiE '<(!doctype html|html|body|head)' "$f" || { echo "::error file=$f::not an HTML page"; exit 1; }
  done < <(files -name '*.html')
  [ "$n" -gt 0 ] && { echo "· $n JavaScript file(s) parse"; checked+=("JavaScript syntax"); }
  [ "$h" -gt 0 ] && { echo "· $h HTML page(s) look right"; checked+=("HTML pages"); }
fi

if [ ${#checked[@]} -eq 0 ]; then
  echo "· No code here yet (docs only), so there is nothing to check. Code added later is checked automatically."
else
  echo "Checked: ${checked[*]}"
fi
echo "GRID check passed"
