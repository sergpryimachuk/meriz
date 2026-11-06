#!/bin/sh
# Écrit la configuration de Meriz dans le build au démarrage du conteneur.
# Lancé par l'entrypoint de l'image nginx, avant nginx lui-même.
#
# Variables lues, toutes facultatives :
#   MERIZ_API_URL           origine du serveur Meriz API, sans /api
#   MERIZ_REVERB_APP_KEY    clé publique Reverb
#   MERIZ_REVERB_HOST       hôte du direct
#   MERIZ_REVERB_PORT       port du direct
#   MERIZ_REVERB_SCHEME     http ou https
#   MERIZ_DEFAULT_TARGET    moteur des nouveaux documents, par exemple
#                           postgresql@17, mariadb@11.8 ou sqlite
# Une variable vide laisse la fonction désactivée. Sans MERIZ_API_URL,
# Meriz marche sans compte et garde les documents dans le navigateur.
set -eu

SOURCE=/opt/meriz/dist
TARGET=/usr/share/nginx/html

# Les valeurs finissent dans des chaînes JavaScript entre accents graves.
# On refuse les caractères qui casseraient la chaîne ou la commande sed.
check_value() {
  name=$1
  value=$2
  case "$value" in
    *'`'* | *'$'* | *'\'* | *'|'* | *'&'* | *'"'* | *"'"* | *'
'*)
      echo "meriz: $name contient un caractère interdit (\` \$ \\ | & guillemets ou saut de ligne)." >&2
      exit 1
      ;;
  esac
}

check_value MERIZ_API_URL "${MERIZ_API_URL:-}"
check_value MERIZ_REVERB_APP_KEY "${MERIZ_REVERB_APP_KEY:-}"
check_value MERIZ_REVERB_HOST "${MERIZ_REVERB_HOST:-}"
check_value MERIZ_REVERB_PORT "${MERIZ_REVERB_PORT:-}"
check_value MERIZ_REVERB_SCHEME "${MERIZ_REVERB_SCHEME:-}"
check_value MERIZ_DEFAULT_TARGET "${MERIZ_DEFAULT_TARGET:-}"

# Moteur, puis version facultative. L'application vérifie que la version
# existe et retombe sur MySQL sinon. Ici, on refuse une forme fausse.
if [ -n "${MERIZ_DEFAULT_TARGET:-}" ]; then
  if ! printf '%s' "$MERIZ_DEFAULT_TARGET" | grep -Eq '^(mysql|mariadb|postgresql|sqlite)(@[0-9]+(\.[0-9]+)*)?$'; then
    echo "meriz: MERIZ_DEFAULT_TARGET doit ressembler à postgresql@17, mariadb@11.8 ou sqlite." >&2
    exit 1
  fi
fi

# Copie neuve du build : un redémarrage repart des marqueurs.
rm -rf "${TARGET:?}"/*
cp -R "$SOURCE"/. "$TARGET"/

# Seuls les fichiers qui portent un marqueur sont réécrits.
grep -rl '__MERIZ_' "$TARGET" | while IFS= read -r file; do
  sed -i \
    -e "s|__MERIZ_API_URL__|${MERIZ_API_URL:-}|g" \
    -e "s|__MERIZ_REVERB_APP_KEY__|${MERIZ_REVERB_APP_KEY:-}|g" \
    -e "s|__MERIZ_REVERB_HOST__|${MERIZ_REVERB_HOST:-}|g" \
    -e "s|__MERIZ_REVERB_PORT__|${MERIZ_REVERB_PORT:-}|g" \
    -e "s|__MERIZ_REVERB_SCHEME__|${MERIZ_REVERB_SCHEME:-}|g" \
    -e "s|__MERIZ_DEFAULT_TARGET__|${MERIZ_DEFAULT_TARGET:-}|g" \
    "$file"
done

if [ -n "${MERIZ_DEFAULT_TARGET:-}" ]; then
  echo "meriz: moteur des nouveaux documents : ${MERIZ_DEFAULT_TARGET}"
fi

if [ -n "${MERIZ_API_URL:-}" ]; then
  echo "meriz: comptes activés, serveur ${MERIZ_API_URL}"
else
  echo "meriz: MERIZ_API_URL vide, Meriz fonctionne sans compte"
fi
