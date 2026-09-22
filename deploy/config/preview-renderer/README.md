# Qualified attachment processing

This is the internal implementation of the existing derivative adapter protocol:
`POST /render`, multipart fields `content`, `sourceContentType`, `renditionCode`,
`specificationHash`; response JSON contains bounded base64 bytes and provenance.
It does not fetch URLs. Gotenberg remains the separate restricted HTML-to-PDF
provider; it cannot satisfy this protocol.

The pinned Pillow/PDFium image accepts PNG, JPEG, WebP and unencrypted PDF. Native
parsing runs in a separate process with CPU/address-space limits. The container
has no published port, a read-only root, bounded temporary storage, no added
capabilities, and an internal network. Only API/workers should join that network.
Keep Office and encrypted-document preview disabled.

Limits: 20 MiB input, 20 PDF pages, 20 million image pixels, 10 MiB output, 25-second
conversion deadline, one active conversion per sidecar. Thumbnails are WebP;
`preview_default` is a raster-only PDF, stripping source scripts, forms, links,
and embedded documents. Every persisted derivative still requires the platform's
malware scanner, source-hash and specification binding. A parser success is not
malware admission.

Use `deploy/compose/instance/compose.preview.yaml` with the normal instance files.
It is an explicit opt-in, not a replacement for `docrender`. It also configures a
separate Tika instance with fixed limits; per-request configuration and pipes
endpoints remain disabled. `PREVIEW_RENDERER_BASE_URL` is deliberately separate
from `DOCRENDER_BASE_URL`. Before first use, qualification performs real PNG→PDF→WebP conversions. Provider
failure disables that work, while original-file access remains available.

From a trusted machine that can reach both internal services:

```sh
python3 deploy/config/preview-renderer/qualify-services.py \
  http://preview-renderer:3000 http://qualified-docparser:9998
```

The checked-in fixtures are synthetic. `encrypted.pdf` uses the test-only password
`fixture-only`. The test checks successful PDF/image renditions, OCR, an enforced
20-page extraction limit, and rejections for encrypted, oversized-page-count and
Office inputs. `qualify.py` additionally generates and validates a clean image
inside the renderer image. `/health` alone cannot qualify either protocol.

Delivery uses a freshly authorized 120-second storage signature, signed PDF/WebP
content type, a fixed inline filename and `private, no-store`. The UI rejects
same-origin delivery, uses native PDF viewing on the separate storage origin,
renews before expiry, and unmounts the viewer on close. Raster-only output plus
origin isolation is the PDF strategy; sandboxed native PDF plugins are not
portable across browsers. Existing signed leases can last up to their expiry
following unlink or permission changes; no new lease is issued after admission
fails.

Worker admission rotates waiting tenants, processes one document at a time per
worker/pipeline, bounds the waiting set and cancels queued work on abort. Native
sidecars provide the final concurrency cap. Multi-worker deployments must size
and shard this capacity deliberately; no claim of cluster-wide FIFO fairness is
made by the local worker gate.

Tika limits follow the [Tika 4 limit configuration](https://tika.apache.org/docs/4.0.x/advanced/setting-limits.html)
and [PDF parser configuration](https://tika.apache.org/docs/4.0.x/configuration/parsers/pdf-parser.html).
The old `X-Tika-*` parser headers do not configure Tika 4.
