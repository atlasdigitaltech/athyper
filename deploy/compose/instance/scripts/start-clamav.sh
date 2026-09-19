#!/bin/sh
set -eu

# The pinned upstream init mutates /etc/clamav and /var/lock. Keep its daemon,
# signature bootstrap and environment handling, but redirect configuration writes
# to tmpfs. Fail closed if the upstream commands change on an image upgrade.
for pattern in 'ln -f -s "/run/lock" "/var/lock"' 'clamd --foreground &' 'freshclam \' ; do
  [ "$(grep -F -c "$pattern" /init)" = 1 ] || {
    echo "Unsupported ClamAV entrypoint: review read-only adaptation" >&2
    exit 1
  }
done
mkdir -p /tmp/clamav-config /run/lock
[ "$(readlink -f /var/lock)" = /run/lock ] || {
  echo "ClamAV image must link /var/lock to /run/lock" >&2
  exit 1
}
cp /etc/clamav/*.conf /tmp/clamav-config/
# FreshClam's reload notification must use the same generated clamd config.
sed -i 's@/etc/clamav/clamd.conf@/tmp/clamav-config/clamd.conf@g' /tmp/clamav-config/freshclam.conf
chown clamav:clamav /var/log/clamav
sed \
  -e 's@/etc/clamav/@/tmp/clamav-config/@g' \
  -e 's@ln -f -s "/run/lock" "/var/lock"@test -d /var/lock@' \
  -e 's@clamd --foreground \&@clamd --config-file=/tmp/clamav-config/clamd.conf --foreground \&@' \
  -e 's@freshclam \\@freshclam --config-file=/tmp/clamav-config/freshclam.conf \\@' \
  /init > /tmp/clamav-init.sh
exec /sbin/tini -- /bin/sh /tmp/clamav-init.sh "$@"
