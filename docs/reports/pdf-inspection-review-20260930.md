# Shared attachment PDF inspection follow-up

The Neon HAR recorded a 422 while finalizing
`SAP Ariba Analysis Reporting API Documentation.pdf` (546,595 bytes), request
`ca1e642d-dd92-4e5e-8899-6369833f05be`. The persisted attachment failure was
`MALWARE_DOCUMENT_UNSUPPORTED / invalid_structure`.

The retained staged bytes reproduce the failure. Their cross-reference stream
contains `/Encrypt 414 0 R`. The inspector attempted Flate decompression of
an earlier encrypted object stream before checking the later cross-reference
stream's encryption declaration. That produced the misleading structural error.
This evidence establishes encryption, not malware. Some encrypted PDFs open in
viewers without prompting for a password.

The shared inspector now checks all outer cross-reference stream trailers in a
revision before decoding any object stream. The same file now reports
`encrypted`. The existing API maps this to 422 with actionable guidance:
“This PDF is encrypted, so its contents cannot be inspected. Export an
unencrypted copy and try again.” The shared upload queue displays the detail
once, offers removal, and does not offer a futile retry or label it malware.

This change does not enable encrypted PDF uploads, decrypt documents, skip
malware scans or weaken stream/size/revision limits. The original failed upload
is not activated or rewritten. To upload this document, export an unencrypted
copy using the original application or an authorized PDF tool, then upload that
copy through Files. Check that normal scanning completes and preview/download
work. Re-uploading the encrypted original should produce the explicit encryption
message. The recovered original was used only as a private temporary verification
artifact and then removed locally. It was not added to the repository.

Regression coverage includes late and early cross-reference encryption markers,
corrupt unencrypted streams, rejecting before yielding embedded content, existing
compressed/incremental PDF extraction, API error mapping and browser queue
recovery. All 97 scanner tests passed in a serial run. An initial parallel run
hit an existing wall-clock cleanup timeout assertion; the serial rerun passed
without changing its limit. Three targeted upload browser tests passed. The 52 targeted attachment API/security tests and scanner typechecks also passed.


## DEV deployment verification

Deployed source identity:
`faf530e679a5c50d774e30b78fc00d16c4160f4bad84cd5b3d9406dee0e16233`.
All six DEV application containers are healthy. The qualified API returned
readiness 200 and anonymous Entity access 401. The built image, connected to the
real DEV ClamAV service, produced these results:

| Sample | Result |
| --- | --- |
| Exact retained failed upload | `encrypted` (134 ms) |
| Generated clean PDF with compressed objects | `clean` (105 ms) |
| PDF containing standard EICAR test attachment | `infected` (9 ms) |

These are scanner checks, not end-to-end upload latency measurements. API 422
mapping and the upload queue were checked by targeted unit/browser tests; no
new user attachment was created during runtime qualification. The original
failed attachment remains historical failure evidence. Retry using a newly
exported unencrypted copy; retrying the encrypted original should display the
specific encryption guidance.

Rollback images and Compose configuration are retained privately under
`~/.athyper/instances/dev/workspace/pdf-inspection-20260930`. No schema,
permission or entity-publication changes were made.
