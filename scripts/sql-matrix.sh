#!/bin/sh
# Exécute le SQL généré par Meriz sur de vrais serveurs.
#
#   scripts/sql-matrix.sh                    tous les services de compose.test.yaml
#   scripts/sql-matrix.sh mysql-8.4 sqlite   seulement ces cibles
#
# MERIZ_SQL_DIR : dossier de scripts déjà générés. Sinon, le script les
# génère avec Vitest (tests/sql-matrix.test.ts) dans un dossier temporaire.
# Chaque script tourne deux fois sur une base vide : la seconde vérifie
# que ses DROP permettent de le rejouer. SQLite tourne sans conteneur.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
COMPOSE="docker compose --progress quiet -f $ROOT/compose.test.yaml"

if [ -z "${MERIZ_SQL_DIR:-}" ]; then
  MERIZ_SQL_DIR=$(mktemp -d)
  trap 'rm -rf "$MERIZ_SQL_DIR"' EXIT
  (cd "$ROOT" && MERIZ_SQL_OUT="$MERIZ_SQL_DIR" npx vitest run tests/sql-matrix.test.ts >/dev/null)
fi

if [ "$#" -eq 0 ]; then
  set -- $($COMPOSE config --services) sqlite
fi

passed=0
failed=0

# Lance un script deux fois. $1 : fichier, la suite : commande qui lit le SQL.
run_twice() {
  file=$1; shift
  for attempt in 1 2; do
    if ! output=$("$@" < "$file" 2>&1); then
      echo "  ÉCHEC $(basename "$file") (passage $attempt)"
      echo "$output" | sed 's/^/    /'
      failed=$((failed + 1))
      return
    fi
  done
  passed=$((passed + 1))
}

for service in "$@"; do
  if [ "$service" = sqlite ]; then
    if ! command -v sqlite3 >/dev/null; then echo "sqlite3 absent : SQLite ignoré"; continue; fi
    before=$passed
    for file in "$MERIZ_SQL_DIR"/sqlite@*__*.sql; do
      # Une base par fichier : les deux passages partagent ses tables.
      db=$(mktemp)
      run_twice "$file" sqlite3 -bail "$db"
      rm -f "$db"
    done
    echo "sqlite $(sqlite3 --version | cut -d' ' -f1) : $((passed - before)) script(s) réussi(s)"
    continue
  fi

  target=$(printf '%s' "$service" | sed 's/-/@/')
  engine=${target%@*}
  before=$passed
  $COMPOSE up -d --wait --quiet-pull "$service" >/dev/null
  for file in "$MERIZ_SQL_DIR"/"$target"__*.sql; do
    case $engine in
      mysql)
        $COMPOSE exec -T "$service" mysql -uroot -pmeriz -e 'DROP DATABASE IF EXISTS meriz; CREATE DATABASE meriz' 2>/dev/null
        run_twice "$file" $COMPOSE exec -T "$service" mysql -uroot -pmeriz meriz ;;
      mariadb)
        $COMPOSE exec -T "$service" mariadb -uroot -pmeriz -e 'DROP DATABASE IF EXISTS meriz; CREATE DATABASE meriz'
        run_twice "$file" $COMPOSE exec -T "$service" mariadb -uroot -pmeriz meriz ;;
      postgresql)
        # Les NOTICE des DROP IF EXISTS ne sont pas des erreurs.
        $COMPOSE exec -T -e PGOPTIONS='-c client_min_messages=warning' "$service" psql -qU postgres -c 'DROP DATABASE IF EXISTS meriz' -c 'CREATE DATABASE meriz' >/dev/null
        run_twice "$file" $COMPOSE exec -T -e PGOPTIONS='-c client_min_messages=warning' "$service" psql -qU postgres -d meriz -v ON_ERROR_STOP=1 ;;
    esac
  done
  $COMPOSE rm -sfv "$service" >/dev/null
  echo "$service : $((passed - before)) script(s) réussi(s)"
done

echo "$passed réussi(s), $failed échec(s)"
[ "$failed" -eq 0 ]
