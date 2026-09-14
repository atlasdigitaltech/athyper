# Keep PostgreSQL and OS packages from the reviewed official image. Replace its
# Go-based privilege helper with the already installed util-linux setpriv.
FROM postgres:16.15-bookworm@sha256:bb3e1a57e5407e0a5280b4211980a5e537f4abd234a87014ac979849a78dd825
RUN set -eu; \
    test -x /usr/bin/setpriv; \
    test "$(grep -c 'exec gosu postgres' /usr/local/bin/docker-entrypoint.sh)" = 1; \
    sed -i 's/exec gosu postgres /exec setpriv --reuid=postgres --regid=postgres --init-groups /' /usr/local/bin/docker-entrypoint.sh; \
    ! grep -q gosu /usr/local/bin/docker-entrypoint.sh; \
    rm /usr/local/bin/gosu; \
    setpriv --reuid=postgres --regid=postgres --init-groups id
