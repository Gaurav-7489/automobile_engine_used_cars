#!/usr/bin/env bash
# LOCAL TEST DATABASES ONLY. Gives a synthetic tenant an owner login so the browser can be pointed at it.
# usage: make-login.sh <tenantId> <email> <password>   (server must be running on $ORIGIN, default http://127.0.0.1:3003)
set -euo pipefail
T=$1; EMAIL=$2; PW=$3; ORIGIN=${ORIGIN:-http://127.0.0.1:3003}
TOKEN=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 40)
H=$(printf %s "$TOKEN" | sha256sum | cut -d' ' -f1)
PSQL="psql -q -h /tmp -p 5544 -U postgres -d vl"
$PSQL -c "INSERT INTO intelligence_tokens(token_hash,kind,tenant_id,email,role,intelligence_role,dealership_ids,location_ids,display_name,created_by,expires_at)
 SELECT '$H','invite','$T','$EMAIL','owner','owner',
   (SELECT jsonb_agg(id) FROM dealerships WHERE tenant_id='$T'), (SELECT jsonb_agg(id) FROM locations WHERE tenant_id='$T'), 'Synthetic Owner','local', now()+interval '1 day'"
curl -s -X POST "$ORIGIN/api/auth/redeem" -H "origin: $ORIGIN" -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\",\"password\":\"$PW\"}" -w " %{http_code}\n"
