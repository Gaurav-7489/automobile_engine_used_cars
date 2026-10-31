#!/usr/bin/env bash
# Starts an isolated local PostgreSQL 16 with TLS for measurement and browser tests. Never points at a hosted database.
# Usage: scripts/local/pg-up.sh   (as root in the cloud sandbox; uses the `postgres` OS user)
set -euo pipefail
D=${LOCAL_PG_DIR:-/var/lib/postgresql/vl}; PORT=${LOCAL_PG_PORT:-5544}; BIN=/usr/lib/postgresql/16/bin
mkdir -p "$D" && chown postgres "$D"
if [ ! -d "$D/data" ]; then
  su postgres -c "$BIN/initdb -D $D/data -A trust >/dev/null"
fi
# A self-signed local certificate; renewed when it is missing or expires within a day.
if [ ! -f "$D/server.crt" ] || ! openssl x509 -in "$D/server.crt" -noout -checkend 86400 >/dev/null 2>&1; then
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$D/server.key" -out "$D/server.crt" -days 365 -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1" 2>/dev/null
  chown postgres "$D/server.key" "$D/server.crt"; chmod 600 "$D/server.key"
  if su postgres -c "$BIN/pg_ctl -D $D/data status" >/dev/null 2>&1; then su postgres -c "$BIN/pg_ctl -D $D/data reload" >/dev/null; echo "renewed the local certificate"; exit 0; fi
fi
rm -f "$D/data/postmaster.pid"
su postgres -c "$BIN/pg_ctl -D $D/data -o '-p $PORT -k /tmp -c ssl=on -c ssl_cert_file=$D/server.crt -c ssl_key_file=$D/server.key' -l $D/log -w start" >/dev/null
echo "postgres up on 127.0.0.1:$PORT (CA file: $D/server.crt)"
