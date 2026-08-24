#!/bin/zsh
# Assemble .dc.html artboards from shared tokens + per-artboard body parts.
cd "$(dirname "$0")"
for body in parts/*.body.html; do
  name="$(basename "$body" .body.html)"
  {
    printf '%s\n' '<!doctype html>' '<html>' '<head>' '  <meta charset="utf-8">' \
      '  <script src="./support.js"></script>' '</head>' '<body>' '<x-dc>' '<helmet>' '  <style>'
    cat _tokens.css
    printf '%s\n' '  </style>' '</helmet>'
    cat "$body"
    printf '%s\n' '</x-dc>' '</body>' '</html>'
  } > "$name.dc.html"
  echo "built $name.dc.html"
done
