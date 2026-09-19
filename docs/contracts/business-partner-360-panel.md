# Business Partner 360 panel

Business Partner uses the shared `EntityRecord360Panel` with six record tabs: 360 View, Requests, Business Transactions, Activity, Comments, and Attachments. The 360 tab renders continuous sections, a sticky section rail, and Primary Contact / Primary Address cards. The wide layout targets 15 / 65 / 20 with minimum sidebar widths; at narrower widths primary details move above the sections, and mobile navigation uses a labelled selector.

## Publication

Author `layoutConfig.recordPresentation.panel` alongside the existing sections and actions. The additive panel contract has its own `schemaVersion: 1`, `kind: "360"`, ordered section keys, ordered tabs with registered `360` or `section` providers, and sidebar bindings to `primary-contact` / `primary-address`. The parser rejects unknown providers, duplicate references, undeclared sections, and sections placed in both the rail and a separate tab. Existing Studio compilation and metadata runtime parsing validate this through `parseEntityRecordPresentation`.

The development publication input is `server/db/scripts/provisioning/config/business-partner-record-presentation.v1.json`. It now contains the complete panel definition. Publish this through the existing record-presentation release process. The Business Partner adapter supplies the same default composition for older published presentations. Deploy matching server and NEON browser code; regenerate BP360 response schemas when changing shared response types.

Metadata controls presentation, never grants access. Section reads still require record admission and section permissions. The renderer intersects configured rail sections with the authorized manifest. Fixed record tabs show a restricted state when their provider is unavailable to the reader. Customer-specific Sales & AR and Credit review remain in the composition when applicable.

## Navigation and loading

The record breadcrumb uses `Display name (Code)` for recognition and a precise reference; when no distinct code is available it shows the display name alone.

`tab` and `section` URL parameters identify the record view; legacy `?section=requests`, `?section=activity`, and `?section=business-activity` links open the corresponding tab. Explicit navigation creates a browser history entry and focuses the destination. Scroll tracking replaces the current entry without refetching the summary. Lazy sections load when approached or selected; a selected heading remains anchored while preceding sections finish loading. Wheel, touch, pointer, or keyboard interaction releases this anchor.

Changing tenant, principal, permission epoch, role, effective date, or transaction context invalidates the rendered record data. Primary cards use the authorized summary and require an explicit primary designation. No primary designation produces an empty state rather than selecting the first record. Selecting transaction context in Overview or a scope-required section updates the record URL without changing the shell's working company.

## Documents and discussion

Certificates appear before other qualification controls. Cards show issuer, number, dates, validity, record status, and an authorized document action. Expired certificates remain available for review. Unscoped reads include partner-wide certificates; company certificates require the selected company. Qualification and certificate permissions are enforced separately; document links require attachment permission. Download URLs come from the existing attachment service on demand and expire locally.

The Attachments tab reads scanned, active, current documents linked to the partner and permitted certificate evidence, deduplicated by attachment. It preserves tenant, record, company, business-date and cursor boundaries. The existing attachment download endpoint independently enforces access. This tab does not introduce a second document store or upload workflow.

Comments use `document.comment` with partner coordinates, tenant boundaries, private-comment visibility and cursor pagination. Plain text is rendered as text. Authorized users can add internal comments through `POST /api/neon/business-partners/:businessPartnerId/360/comments`; this rechecks record admission and comment capability before calling the existing collaboration service with a fixed partner coordinate and an idempotency key. Historical views cannot add comments.

Business Transactions uses the existing authorized provider integration. When no provider is registered, the tab reports that explicitly; no transaction totals or scores are fabricated.

## Display and security

Industry references resolve to their shared classification code/name. Organization, company, legal entity and payment-term references resolve through a fixed tenant-bound registry. Technical IDs remain available in expandable details. Countries and common business codes use readable labels. Empty optional identity fields can be expanded on demand.

Bank account values remain masked. Full values use the existing permission-controlled, audited, expiring reveal operation. Banking remains discoverable across roles for authorized readers, while data still requires explicit scope. No IAM grants are added by the panel configuration.

## Verification

Tests cover contract validation, section permissions, certificate-only access, document and comment query boundaries, comment mutation admission, desktop/mobile layout, deep links, browser history, keyboard navigation, and summary request reuse. Browser fixtures exercise the real Business Partner shell with controlled API responses. Live deployment and authenticated acceptance require the matching metadata/server/browser release.
