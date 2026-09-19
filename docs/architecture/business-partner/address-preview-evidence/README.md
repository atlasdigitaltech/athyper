# Address preview renderer integration

Studio now selects the production `EntityDataSurface` for data-input/repeatable surfaces and retains `EntityIntakeSurface` for classification surfaces. Mixed controls and registered business handlers remain explicitly unsupported. Sample answers and resets remain local.

A read-only `GET /api/meta-entity-authoring/inspection/address-preview-choices` endpoint uses the same `addressFormChoices` resolver as Neon. It requires authenticated Studio author/reviewer inspection authority and returns private, noncached Country/State/Region reference options including conditional metadata. No reference history adapters, uploads or business commands are enabled. Failures show a retryable message.

Shared searchable-select popovers now use their control's owner document and viewport, keeping dropdowns correctly positioned inside preview frames.

## Evidence

- Fixture extracted read-only from UI-test draft revision 3; no live graph writes.
- Real compiler and data renderer tested with explicit synthetic reference choices (Malaysia/Selangor).
- Browser checks cover City editing/help text, country and region selection, manual region confirmation, PO-box conditional visibility, responsive switching and reset.
- Screenshots: `desktop.png`, `mobile.png`; browser results: `results.json`.
- Author/reviewer inspection route tests passed, including forbidden reads without authority. Studio and platform-host TypeScript checks passed.
- Deployment follow-up (2026-09-16): the live **404** was `RELAY_OPERATION_NOT_ALLOWED`; Studio's relay was missing the explicit GET allowlist entry. Added that entry and the saved-history GET routes. Source-mode development services picked up the update.
- Live relay now returns **401 AUTHENTICATION_REQUIRED** with the expired saved Studio session; the backend endpoint also responds **401 AUTH_TOKEN_REQUIRED** without credentials. After refreshing the catl.admin session, authenticated verification returned **200** with **247 Country choices** and **301 State/Region choices** through the Studio relay. No draft save or publication was performed during verification.
- Four relay contract tests and relay TypeScript check pass; tests cover allowed GETs, denied POSTs, and rejection of arbitrary inspection routes.
- Applied the existing additive `draft-save-history.sql` upgrade to the development Studio database to support the already implemented history-enabled backend. Existing draft graphs and publications were not modified; earlier missing save snapshots are not fabricated.

Reproduce: `node docs/architecture/business-partner/address-preview-evidence/browser-check.cjs`.
