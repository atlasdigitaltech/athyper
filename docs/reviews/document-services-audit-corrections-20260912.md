# Document service audit corrections — 2026-09-12

The Compose parity overlay and capability catalog now pin Gotenberg 8.37.0 and
Tika 3.3.1.0-full to Docker Hub manifest digests verified during this correction.
The Tika 3.x image preserves the existing server API and OCR capability.

- Gotenberg: https://github.com/gotenberg/gotenberg/releases/tag/v8.37.0
- Temporary-file disclosure: https://github.com/gotenberg/gotenberg/security/advisories/GHSA-g924-cjx7-2rjw
- Tika parser vulnerabilities: https://tika.apache.org/security.html

Gotenberg retains uploaded HTML/asset rendering, blocks Chromium HTTP(S) fetches,
disables downloadFrom and PDF-engine routes, and denies webhook destinations.
Tika and Gotenberg now use an internal document-services network, joined by API,
worker and scheduler. They no longer directly share the database/search network.
This reduces peer access; it does not implement caller authentication. When
rolling out, recreate the document services and all three runtimes together so
network membership and DNS resolution agree. Qualification clients that directly
call the processors must also join this network. Do not casually add other peers.

The scanner README now reflects the passing Stage 6 adapter guard evidence rather
than the historical compressed-PDF admission failure. Direct clamd callers still
lack that application guard. Initial startup still requires trusted current
signatures, and admission still fails closed on unavailable/stale scanning.

An explicit virusscan Bake target records source revision metadata. Publishing a
qualified scanner image and replacing deployment-time builds with its returned
digest remain release work; no digest or publication is claimed here. The current
workspace contains unrelated uncommitted changes, so it is not a clean release
source. The existing release build flow also requires clean committed source.

Bare restart values are quoted. Resource limits and the Meilisearch pin are
unchanged: this review established no measured OOM or specific Meilisearch defect
that would justify an unqualified capacity change or data-format upgrade.

## Verification

Run the disposable image qualification with images already pulled:

```sh
ATHYPER_DOCUMENT_IMAGE_TESTS=true node --test deploy/compose/tests/document-services.integration.test.mjs
```

It exercises startup under configured CPU/memory/capability limits, HTML-to-PDF,
blocked URL conversions, disabled PDF-engine routes, text extraction and an XFA
local-file external-entity regression fixture. It does not certify all formats,
maximum load, authenticated application workflows or production topology.

The renderer/parser adapter suites pass 33 tests. Deployment policy passes for
DEV, QA and STG. The existing Compose structure suite passes 18 of 19 tests; its
migration-order assertion fails on the workspace's unrelated migration changes.

Live disposable qualification passed 2/2 tests on 2026-09-12 with the pinned
images, including the network membership assertion and all image probes above.
Both temporary containers were removed. Docker Compose's merged configuration
also confirms all three runtimes join document-services and neither processor
joins data. Existing deployed instances were not recreated by this correction.
