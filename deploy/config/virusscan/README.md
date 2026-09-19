# ClamAV ZIP limit correction

`athyper/clamav:1.5.2-zip-limit-1` retains the upstream daemon and FreshClam
entrypoint and replaces libclamav with a narrow source patch. The Dockerfile pins
the upstream base digest and verifies the downloaded source archive SHA-256.
Builder packages are resolved from Alpine repositories; this is not a claim of
bit-for-bit reproducible builds. A published, digest-pinned release image remains
deployment work.

The patch records `Heuristics.Limits.Exceeded.MaxFileSize` through ClamAV's existing
helper in four ZIP extraction truncation branches: stored, deflate/deflate64,
bzip2 and implode. `AlertExceedsMax=yes` remains required. The adapter treats the
result as infected and blocks admission. It does not increase inspection limits.

Build from the repository root:

```sh
docker build -t athyper/clamav:1.5.2-zip-limit-1 deploy/config/virusscan
```

Run `tooling/scripts/verification/qualify-virusscan.py` against the development
scanner after deployment. It tests live limits and network reachability and starts
an isolated daemon with a harmless custom signature database for reload, stale
recovery, ZIP boundary and beyond-limit-marker tests. It never mounts that custom
database into the deployed scanner. Stored ZIP header overhead counts toward the
outer file limit; compressed members are also checked at the extraction boundary.
Deflate64 and implode branches require additional format fixtures.

This engine patch does not fix compressed PDF attachments. The application scanner
now applies a bounded PDF attachment guard and independently scans recovered streams.
The latest Stage 6 development service-entrypoint run passes 10/10 cases, including
compressed embedded EICAR. Unsupported PDF structures fail closed. Authenticated HTTP,
worker/derivative execution and production topology still need qualification; see
`docs/reviews/virusscan-stage6.md`. Direct clamd callers do not receive this guard.

Initial startup requires a fresh signature database and may block the application
while FreshClam downloads it. Pre-seed the scanner volume with a trusted, current
FreshClam database for restricted networks. Do not disable admission scanning or
freshness checks to work around bootstrap failures. The healthcheck's file mtime is
only a startup signal; admission checks the daemon's loaded signature build date.

The scanner joins `document-services` and `signature-egress`, with no direct
membership in the database/search `data` network. API, worker and scheduler reach
`virusscan:3310` through `document-services`. Recreate the scanner and runtimes
together when applying this topology to an older deployment. Signature egress is
still unrestricted and clamd listens on both interfaces; network separation does
not provide a signature-domain allowlist or separate FreshClam from clamd.

The explicit Bake target records `SOURCE_REVISION` using the same OCI labels as
application images:

```sh
SOURCE_REVISION="$(git rev-parse HEAD)" docker buildx bake --file deploy/docker-bake.hcl virusscan
```

Before publication, commit/review the source and qualify the built image. Publish
that tested image to the release registry, record its returned repository digest,
and replace the deployment `image` reference with it while removing `build` and
`pull_policy: build`. Do not invent a digest or publish an unqualified rebuild.
Registry publication and production rollout are still pending; this target alone
is not release qualification.
