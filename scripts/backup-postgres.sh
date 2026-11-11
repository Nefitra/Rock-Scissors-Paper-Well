#!/bin/sh
set -eu
umask 077
cd /opt/viral-arena/app
install -d -m 700 /opt/viral-arena/backups
backup=/opt/viral-arena/backups/cyberduel-$(date -u +%Y%m%dT%H%M%SZ).dump
docker compose exec -T postgres pg_dump -U cyberduel -Fc cyberduel > "$backup.part"
test -s "$backup.part"
docker compose exec -T postgres pg_restore --list < "$backup.part" > /dev/null
mv "$backup.part" "$backup"
printf 'Database backup verified: %s\n' "$backup"
