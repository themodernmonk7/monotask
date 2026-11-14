#!/usr/bin/env bash
# Run a .sql file against the Supabase Postgres database.
#
#   ./scripts/run-sql.sh supabase/seed-demo-data.sql
#
# Connection string comes from SUPABASE_DB_URL, either exported in your shell
# or set in .env (which is gitignored). Get it from:
#   Supabase Dashboard -> Project Settings -> Database -> Connection string -> URI
#
# Uses local psql when installed, otherwise runs it through Docker so there is
# nothing to install.

set -euo pipefail

FILE="${1:-}"

if [ -z "$FILE" ]; then
  echo "usage: $0 <path-to.sql>" >&2
  exit 64
fi

if [ ! -f "$FILE" ]; then
  echo "error: no such file: $FILE" >&2
  exit 66
fi

# Prefer the environment; fall back to .env without sourcing the whole file.
DB_URL="${SUPABASE_DB_URL:-}"
if [ -z "$DB_URL" ] && [ -f .env ]; then
  # `|| true`: grep exits non-zero when absent, which set -o pipefail would
  # otherwise turn into a silent exit before the help text below.
  DB_URL="$(grep -E '^[[:space:]]*SUPABASE_DB_URL=' .env | head -1 | cut -d= -f2- | sed 's/^["'\'']//; s/["'\'']$//' || true)"
fi

if [ -z "$DB_URL" ]; then
  cat >&2 <<'EOF'
error: SUPABASE_DB_URL is not set.

Add it to .env (gitignored):

  SUPABASE_DB_URL=postgresql://postgres:YOUR-PASSWORD@db.YOUR-REF.supabase.co:5432/postgres

Find it in: Supabase Dashboard -> Project Settings -> Database -> Connection string -> URI
(then replace [YOUR-PASSWORD] with your database password)
EOF
  exit 78
fi

echo "Running $FILE ..."

if command -v psql >/dev/null 2>&1; then
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$FILE"
elif docker info >/dev/null 2>&1; then
  SQL_DIR="$(cd "$(dirname "$FILE")" && pwd)"
  docker run --rm -i \
    -v "$SQL_DIR:/sql:ro" \
    postgres:16-alpine \
    psql "$DB_URL" -v ON_ERROR_STOP=1 -f "/sql/$(basename "$FILE")"
else
  cat >&2 <<'EOF'
error: needs either psql or a running Docker daemon.

  brew install libpq && brew link --force libpq

...or start Docker Desktop and re-run.
EOF
  exit 69
fi

echo "Done: $FILE"
