# CA-09 local implementation and qualification — 2026-09-22

The derivative protocol now has its own internal Pillow 12.3.0 / PDFium
(pypdfium2 5.9.0) sidecar. Gotenberg 8.37 retains its restricted HTML-to-PDF role.
A successful health response does not qualify the derivative adapter: actual
PNG→PDF→first-page WebP conversion must succeed before it serves a render.
Office and encrypted previews remain unsupported.

## Implemented

- Authorized full PDF/image preview (normalized PDF) and first-page thumbnails,
  with explicit unsupported/processing/failure states. Delivery is isolated from
  the application origin; short leases renew through capability authorization.
  Closing a viewer aborts polling and removes its browsing context.
- Signed byte ranges, fixed inline filename, safe content type and no-store
  response overrides. No permanent object URL is returned. Existing leases last
  at most 120 seconds after unlink; subsequent admission is denied.
- Exact-record search from durable extraction with per-file download admission,
  320-character escaped snippets, 25-result cursor pages and a two-second SQL
  statement limit. A temporary external-index outage does not prevent this search.
- Extraction persists independently of index availability. Retries reuse the
  saved extraction. Both extraction and derivative handlers recheck source
  eligibility, and ready-derivative persistence checks current clean source/link
  state. Unlink/archive/deactivation enqueue index removal; current-link checks
  prevent stale index snippets from being exposed while cleanup is pending.
- Bounded native input/output, PDF pages and OCR; per-worker round-robin tenant
  admission, bounded waiting and abort handling; exponential retry backoff.
- Source capability definitions and handler registry entries enable preview,
  extraction and search through the existing publication model. No permission
  bypass or direct edit to an applied release was used.

## Actual local checks

`evidence/ca09/provider-requests.jsonl` records real provider requests, not mocks.
`evidence/ca09/local-integration.json` records the scan, delivery, and database
checks. Focused suites passed: preview adapter 5, derivatives 26, extraction 20,
attachments 72, storage 24, and search 60 tests. The host suite passed 488 tests
with one skipped. Affected host, service, adapter, relay, and UI typechecks pass.
The synthetic fixtures and repeatable provider check are under
`deploy/config/preview-renderer/`.

| Check | Result |
| --- | --- |
| Real PNG/PDF thumbnail and normalized-PDF requests | HTTP 200; roughly 80–100 ms on small fixtures |
| Office, encrypted PDF and >20-page PDF preview | HTTP 422, controlled unsupported result |
| Clean source PDF and generated PDF malware scans | Both clean; scanning was not bypassed |
| Signed first five PDF bytes | HTTP 206, `%PDF-`, `application/pdf`, inline disposition |
| Unsigned object request | HTTP 403 |
| Real PDF text extraction | Expected fixture text; cold request about 2.5 s |
| Real image OCR | `CLEAN OCR FIXTURE` recognized; the zero in the prefix can be read as O |
| 21-page extraction fixture | Page 20 present; page 21 absent |
| Database exact-record search | One fixture hit; zero for another record |
| After deleting the fixture association | Zero hits; preview admission failed |
| Database fixture cleanup | Transaction rolled back |
| Native container inspection | No OOM kill or restart observed; renderer ~16 MiB and parser ~397 MiB after final checks |

The database service check used test admission to exercise real SQL and lifecycle
state, not an authenticated user session. Unit tests separately cover permission
denial before reads/signing and per-result snippet admission.

The initial local database lacked `scanned_at` / `scan_status`, even though the
service already required them. Its receipt table had no derivative-scan upgrade.
After inspecting the schema, the existing specific
`20260911_derivative_scan_evidence.sql` upgrade was applied to local NEON only.
No migration receipts were rewritten. The canonical processing grant file was
also applied: the worker can read linked sources, update extraction fields and
write derivative rows, but cannot update original attachment lifecycle status.
The grants remain subject to tenant RLS and are included in fresh plane manifests.

Tika 4 ignored legacy parser-limit headers. A real 21-page fixture exposed that;
fixed server configuration now enforces the limits without enabling `/config`.
The parser reported that its effective 247 MiB heap was below its recommended
minimum. Its explicit heap was raised to 384 MiB within the existing 768 MiB
container limit, then the actual OCR/page-limit requests passed again. A cold
parser fork accounts for the roughly 2.8-second first request; warm OCR was
about 137 ms on the small synthetic image. No load benchmark is claimed.
The existing malware guard also rejects compressed PDF object/xref streams; this
qualification used a PDF without object streams and did not weaken that guard.

## Limits and acceptance boundary

Preview: 20 MiB input, 20 pages, 20 million source-image pixels, 10 MiB output,
25-second child deadline. Extraction: 20 MiB input, 20 PDF pages, OCR at most three
PDF pages at 150 DPI / four million pixels, ten seconds per OCR call, 30-second
task / 15-second progress deadline, 200,000 output characters, one 384 MiB parser
fork in a 768 MiB container. Search covers the bounded extracted portion.

The local implementation and provider/database qualification do not require a
browser session. Signed-in UI acceptance and governed publication of the source
capability changes remain part of the integrated acceptance pass: the saved NEON
sessions returned 401. They were not bypassed or replaced with elevated sessions.
The new capability definition has not been written directly into an applied
release. Browser visual/keyboard acceptance is not claimed by these checks.
