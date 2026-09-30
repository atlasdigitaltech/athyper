FROM alpine:3.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
# Runtime has only the internal data network; install dependencies at build time.
RUN apk upgrade --no-cache && apk add --no-cache curl jq
# Pre-create the mountpoint owned by the runtime user: Docker seeds a fresh
# named volume's initial content/ownership from what already exists here.
RUN mkdir -p /run/searchcore && chown 1000:1000 /run/searchcore
USER 1000:1000
