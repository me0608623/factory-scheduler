# Shared by the disposable PG17 drill and runtime tests. Never prints SQL data.
# DRILL_PRIVATE is a restricted, freshly created runner/test directory.
if [ -f "$DRILL_PRIVATE/accounts.sh" ]; then
  # Shell-local only: Actions prints GITHUB_ENV entries in each subsequent step.
  source "$DRILL_PRIVATE/accounts.sh"
  export -n BOSS LEAD VIEWER
fi
drill_sql() {
  local result
  if result=$(docker exec drill-pg psql -U postgres -d postgres -X -q -t -A \
      -v ON_ERROR_STOP=1 -v VERBOSITY=terse -c "$1" 2> "$DRILL_PRIVATE/query.err"); then
    printf '%s\n' "$result"
  else
    echo QUERY_FAILED
  fi
}
run_as() { drill_sql "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$1'; $2 ROLLBACK;"; }
perm() { run_as "$1" "SELECT has_permission('$2');"; }
call_commit() { drill_sql "SET ROLE authenticated; SET request.jwt.claim.sub='$1'; $2"; }
ver() {
  local result
  result=$(drill_sql 'SELECT version FROM schedule_state;')
  [[ "$result" =~ ^[0-9]+$ ]] || { echo 'Version query failed; private diagnostics withheld' >&2; return 1; }
  printf '%s\n' "$result"
}
rows() {
  local result
  result=$(run_as "$1" "$2")
  if [ "$result" = QUERY_FAILED ]; then echo QUERY_FAILED
  else printf '%s\n' "$result" | awk 'NF { n++ } END { print n+0 }'; fi
}
err_as() {
  local result
  if docker exec drill-pg psql -U postgres -d postgres -X -q -t -A \
      -v ON_ERROR_STOP=1 -v VERBOSITY=terse -c \
      "BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='$1'; $2 ROLLBACK;" \
      > "$DRILL_PRIVATE/rejected.out" 2> "$DRILL_PRIVATE/rejected.err"; then
    echo NO_ERROR
  elif ! grep -q '^ERROR:' "$DRILL_PRIVATE/rejected.err"; then echo QUERY_FAILED
  elif grep -Fq -- "$3" "$DRILL_PRIVATE/rejected.err"; then echo MATCHED
  else echo WRONG_ERROR; fi
}
expect() {
  if [ "$2" = "$3" ] && [ "$3" != QUERY_FAILED ]; then
    PASS=$((PASS+1)); echo "PASS: $1"
  else FAIL=$((FAIL+1)); echo "FAIL: $1 (private result withheld)"; fi
}
drill_required() {
  local result
  result=$(drill_sql "$1")
  if [ "$result" = QUERY_FAILED ]; then echo 'Required isolated query failed; private diagnostics withheld'; return 1; fi
}
