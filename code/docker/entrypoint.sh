#!/bin/sh
set -e

# Validate required env
if [ -z "$SIFTER_LLM_API_KEY" ]; then
  echo "ERROR: SIFTER_LLM_API_KEY is required." >&2
  exit 1
fi

# Initialise MongoDB data directory
mkdir -p /data/db
chown -R nobody:nogroup /data/db 2>/dev/null || true

# When external MongoDB is configured, disable the embedded mongod
if [ "${SIFTER_DISABLE_EMBEDDED_MONGO:-false}" = "true" ]; then
  sed -i 's/^autostart=true\(.*\)\[program:mongod\]/autostart=false\1[program:mongod]/' \
    /etc/supervisor/conf.d/sifter.conf 2>/dev/null || true
fi

exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/sifter.conf
