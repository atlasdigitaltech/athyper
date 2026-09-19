# Stage 6: integrated service qualification

## Guard correction and passing deployed run — 2026-09-12

[The corrected infrastructure run](virusscan-stage6-guard-fixed-20260912.json)
passes **10/10 scenarios**, including the previously missed compressed embedded
EICAR payload, against development Postgres/RLS, MinIO, Gotenberg and ClamAV.
The existing dedicated qualification tenant/template was reused. Objects created
by the run were cleaned up; database audit evidence remains. Earlier failing
results below are historical, not the current admission result.

The compensating control now uses pdf-lib's raw object parser in a disposable
worker. It handles escaped names, literal strings and comments, verifies stream
lengths, resolves file-spec attachment references, and rejects unsupported syntax.
Embedded daemon replies use the main scan response validator: errors, malformed
responses and premature clean replies fail closed. Input is bounded before copying;
non-PDF streams stop retaining content. One aggregate decoded-byte budget covers
all attachments, which are delivered one at a time. Deadline, cancellation and
shutdown terminate the worker; its JavaScript heap is limited to 128 MiB.

This is deliberately conservative: encrypted PDFs, compressed object/xref streams,
incremental revisions, unsupported attachment filters/decode parameters, and direct
nested PDF attachments are rejected rather than certified clean. These restrictions
can reject otherwise benign PDFs. This control does not establish exhaustive
recursive inspection of every possible container format.

ClamAV, Gotenberg and Meilisearch were reconciled to the Compose configuration and
verified healthy ([captured deployment state](virusscan-capabilities-20260912.json)).
The real Meilisearch entrypoint needs `DAC_OVERRIDE` to read its
host-owned Compose secret; a bare-image startup test had missed this requirement.

The passing matrix qualifies the tested development service entrypoints. It still
does not qualify authenticated HTTP routes, worker/derivative execution, public
object gateway routing, notification transport, or production topology. No external
notification was sent. Immutable image publication and automated qualification CI
remain separate deployment work.

## Compensating control for the compressed-attachment gap — 2026-09-12 (later same day)

The 9/10 infrastructure result below was reproduced directly against the live
development daemon, isolated from the rest of the pipeline: the same EICAR bytes are
detected when embedded **uncompressed** in a PDF, and missed when the identical
stream is Flate-compressed. This confirms the gap is in ClamAV 1.5.2's PDF parser
(it does not decompress `/Type /EmbeddedFile` streams before scanning), not in
pdf-lib's output, the renderer, or the rest of the document pipeline.

`ClamAvMalwareScanner` (`server/packages/adapters/malware-clamav/src/clamav-malware-scanner.ts`)
now closes this gap at the adapter level: while a document is being streamed to
clamd for its normal scan, the adapter also retains a copy of the bytes actually
sent (no change to the existing connect/send/response-race timing — this is
additive, not a new blocking step). If the outer scan comes back clean **and** the
retained bytes start with the real `%PDF-` magic number (the caller-declared
`contentType` is never trusted for this decision — an attacker controls it), the
adapter extracts every `/Type /EmbeddedFile` stream
(`server/packages/adapters/malware-clamav/src/pdf-embedded-files.ts`), decompresses
FlateDecode-filtered ones, and submits each independently to clamd over its own
INSTREAM connection. An unsupported filter, a corrupt stream, or a decompressed size
over the scan's own byte limit fails closed (`MalwareScannerProtocolError`) rather
than being silently waved through.

**Verified live against the same running development daemon** used for the
infrastructure run below: a clean PDF still returns `clean`; the same
compressed-EICAR-attachment PDF now returns `infected` with the daemon's own
`Eicar-Test-Signature` threat name, from a single sub-scan of the recovered bytes;
and re-sending the identical bytes with a spoofed `contentType` (`image/png`)
produces the same detection, confirming the guard cannot be bypassed by lying about
content type. Adapter unit tests cover this directly, including a regression test
for the specific extraction bug found while verifying against real pdf-lib output
(a dictionary value ending in `...stream`, e.g. `/Subtype
/application#2Foctet-stream`, was initially mistaken for the start of stream data
and corrupted the recovered bytes — see `pdf-embedded-files.test.ts` and
`clamav-embedded-file-guard.test.ts`).

**Deliberately narrow, and not a substitute for an engine fix:** only FlateDecode
streams in a classic (non object-stream) cross-reference table are covered — the
case reproduced live, matching the scope the ZIP-limit patch already established for
this daemon. PDFs carrying embedded files inside compressed cross-reference/object
streams, or filtered with something other than FlateDecode, are not covered and fail
closed rather than being silently accepted.

**Not yet re-run: the full infrastructure harness below.** The adapter-level fix is
verified against the live daemon directly; re-running
`qualify-document-infrastructure.ts` end-to-end (which also re-exercises
persistence, RLS, and notification delivery) needs the same seeded tenant/principal/
published-document-template the original run used, and that seed was created by
hand rather than by a reusable script. Do not mark Stage 6 qualified until that
re-run's `render/eicar` scenario is confirmed passing against this fix.

## Deployed development follow-up — 2026-09-12

The new [infrastructure runner](../../server/apps/platform-host/src/scripts/qualify-document-infrastructure.ts)
uses real committed Postgres transactions with the `athyper_runtime` role (no
superuser or RLS bypass), production repositories, MinIO with application
credentials, a persisted published template, Gotenberg and ClamAV. Its
[captured result](virusscan-stage6-infrastructure-20260912.json) is **9/10 passing,
not qualified**. A PDF containing a compressed embedded EICAR attachment was
accepted and persisted as active with scan evidence. The failing case is retained;
the EICAR test object and all other objects from this run were removed successfully.
This resembles the upstream [compressed EmbeddedFile report](https://github.com/Cisco-Talos/clamav/issues/1773),
and the exact engine root cause has now been isolated (above): FlateDecode-compressed
EmbeddedFile stream content is not decompressed before ClamAV's PDF parser decides
the document is clean.

Passing cases cover clean upload/render, direct EICAR upload rejection, outages,
stale signatures and recovery of the same requests. Access checks exercise actual
signed S3 reads, unsigned denial, tenant RLS, and retained quarantined objects.
Cleanup also exposed a status-evidence trigger violation on deleted-to-purged
updates; repository methods now preserve status evidence when status is unchanged.

Run `pnpm --filter @athyper/server-platform-host qualify:document-infrastructure`
inside the development application network. Required files are supplied through
`QUALIFY_RUNTIME_ENV_FILE` (application runtime configuration including credentials),
`QUALIFY_SEED_FILE` (dedicated tenant/principal/other-tenant/run UUIDs), and
`QUALIFY_OUTPUT` (JSON evidence). Seed a published document template bound to
entity `qualification`, operation `print`, for the dedicated tenant before running.
Protect credential files and never commit them. The runner creates and purges only
its own objects, retaining database audit evidence in that tenant.

These are service-entrypoint tests. Authorization descriptors, audit/outbox sinks
and fault injection remain controlled; authenticated HTTP, worker/derivative jobs,
public object gateway routing and notification transport are still unqualified.
No notifications are sent. The earlier fixture-only results below are historical
and must not be used to override this failing infrastructure result.

Implemented and exercised on 2026-09-11: **16 scenarios passed** against the running
development ClamAV 1.5.2 daemon, loaded signature revision 28119.

- [Runner](../../server/apps/platform-host/src/scripts/qualify-document-malware.ts)
- [Captured results](virusscan-stage6-dev-20260911.json)

## What runs together

The production `ClamAvMalwareScanner`, attachment lifecycle, document rendering
service, and notification attachment resolver run together. Uploads use HTTP PUT
grants; downloads and notification links are fetched over HTTP and compared by
SHA-256 with the admitted bytes. Notification embedding also verifies identical
bytes. State written by admission is the state read by downstream access.

The scanner connects through a loopback-only fault proxy to the real development
daemon. INSTREAM responses are never fabricated. Before the matrix starts, the
runner requires healthy, fresh daemon signatures and verifies actual detection of
the standard harmless EICAR test string. Failure of either prerequisite fails the
run, rather than skipping it.

**Fixture boundaries:** repositories, transactions, quota, outbox, identity/access
policy, PDF renderer, and the private HTTP object store are controlled fixtures.
The renderer supplies controlled output bytes to the production rendering service
so EICAR can be injected exactly at the scanner boundary. This is service integration
qualification, not certification of Gotenberg, Postgres/RLS, S3 bucket policies,
authentication middleware, durable worker scheduling, or notification transport.
No notification is sent. Derivative jobs are not part of this matrix.

## Matrix

Each row runs for both **staged upload/finalization** and **templated document render**.

| Scenario                 | Required result                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clean                    | Scan succeeds before activation; download, notification link, and embedded content match the input bytes. Render output is scanned before storage.             |
| EICAR                    | Upload becomes quarantined; render throws `DOCUMENT_MALWARE_DETECTED` (422) without storing output or persisting an artifact. No downstream access is granted. |
| Daemon outage            | Proxy disconnects all operations. No activation, generated/finalized event, or download grant.                                                                 |
| Outage recovery          | Fresh clean work succeeds. The outage test additionally retries and activates the **same staged upload** after recovery.                                       |
| Scan-connection outage   | VERSION and PING succeed, but the INSTREAM connection is closed. A healthy readiness result must not allow activation when the scan fails.                     |
| Scan-connection recovery | New clean work succeeds; the failed staged upload also succeeds on retry after restoring connectivity.                                                         |
| Stale signatures         | Proxy returns an old VERSION build date; the actual adapter rejects admission with `MALWARE_SCANNER_SIGNATURE_STALE`.                                          |
| Freshness recovery       | Restoring the real VERSION reply restores healthy admission and successful downstream access; the same staged upload is retried too.                           |

The freshness cache interval is 1 ms in this harness, and each scenario checks
health explicitly, to avoid waiting five minutes between injected states. This
does not qualify the deployed cache interval or claim that signatures were changed
on the live daemon. Stage 5 separately exercises actual database reload.

Current error semantics are recorded rather than hidden: an unavailable VERSION
query is reported by the adapter as unverifiable/stale signatures. A disconnect
during INSTREAM may produce a protocol or unavailable error depending on whether
the write or response read fails first. Both must block admission.

## Quarantine assertions

Before finalization, neither an upload grant nor an unsigned object URL permits
reads. Downloads and notification link/content resolution reject the staged row.
After rejection, the failed immutable scan copy is removed and the staged object
still exists, so denial tests exercise retained content rather than a missing object.

The EICAR row stays quarantined for the remainder of the matrix. The fixture also
retains a checksum and sets the prior scan-evidence and active flags to true:
quarantine status must independently
prevent access even if old scan evidence remains. Download and both notification
access modes are checked again after every recovery, and none may mint a URL.
Unsigned HTTP access to each retained quarantine object continues to return 403.

These assertions qualify the service admission/access decisions and fixture grant
semantics. They do not substitute for tests against deployed object-store IAM or
prove revocation of URLs that were issued before a later quarantine transition.

## Run

Choose an explicitly reachable **development** daemon. The captured run used the
dev container's data-network IP; addresses change when the stack is recreated.

```sh
QUALIFY_CLAMD_HOST=172.22.0.7 \
QUALIFY_CLAMD_PORT=3310 \
QUALIFY_OUTPUT=/tmp/virusscan-stage6.json \
pnpm --filter @athyper/server-platform-host qualify:document-malware
```

The command creates only ephemeral loopback listeners and in-memory fixture state.
It does not change the live application database, object storage, signature files,
or daemon configuration. It writes JSON evidence on success or scenario failure,
exits nonzero on failure, and closes its servers and scanner sockets on completion.

## Validation and remaining qualification

- Integrated matrix: **16/16 passed**.
- Platform-host typecheck: initially passed; the final run reports an unrelated
  `Transaction<DB>` / `Kysely<Database>` mismatch in
  `src/composition/register-services.ts:6728`. No errors are reported in the new runner.
- Platform-host regression suite: **437 passed, 1 skipped**.

See the [current Stage 5 results](virusscan-stage5.md) for ZIP inspection status.
The deployed follow-up above supersedes the persistence, storage and renderer
fixture limitations; its compressed-PDF failure and remaining workflow boundaries
still prevent full qualification.
