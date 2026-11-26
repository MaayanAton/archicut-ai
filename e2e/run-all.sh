#!/bin/bash
# Runs every browser test against the app at $BASE (default http://localhost:4173/).
export LANG=C.UTF-8 LC_ALL=C.UTF-8
cd "$(dirname "$0")"
fail=0
for t in t_projections t_section t_drawing t_upload t_crop t_home t_printphone t_browserprint; do
  out=$(node $t.cjs 2>&1) || fail=1
  echo "== $t: $(echo "$out" | grep -c '^PASS') passed, $(echo "$out" | grep -c '^FAIL') failed"
  echo "$out" | grep -E '^FAIL|Error' | head -5
done
out=$(node t_print.cjs 2>&1) || fail=1
echo "== t_print: $(echo "$out" | grep -c '^PASS') passed, $(echo "$out" | grep -c '^FAIL') failed"
python3 measure_ruler.py .output/out/cube.png 300
exit $fail
