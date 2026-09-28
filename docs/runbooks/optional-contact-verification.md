# Optional contact verification and core authentication

Contact evidence verification is not user authentication. Host configuration no
longer imports the deleted Master Data service. Provider key parsing and scoped
Ed25519 verification live in `@athyper/server-platform-verification`, with no
Business Partner, persistence or IAM startup dependency.

`CONTACT_VERIFICATION_ENABLED=true` explicitly opts in. Trust comes from
`CONTACT_VERIFICATION_KEYS_JSON`; `MASTER_DATA_VERIFICATION_KEYS_JSON` remains an
operator-configuration compatibility input, not an authentication dependency.
Disabled configuration is not parsed. Invalid enabled configuration produces
`unavailable/INVALID_CONFIGURATION` rather than throwing out of host startup.
Cryptographic parser errors and key material are never included in diagnostics.

Trust configuration alone does not enable endpoints. A trusted contact-verification
adapter must be registered separately. It must authorize the actual parent/resource,
validate inputs, construct canonical target-bound evidence bytes, verify signatures,
enforce expiration and replay protection, and persist verification atomically.
The shared signature primitive is not a complete contact-verification service.
No production or local challenge adapter has been restored in this change.

The existing verification URLs remain registered:

- `POST /api/master/contacts/:id/verification-challenges`
- `POST /api/master/verification-challenges/:id/complete`
- `PATCH /api/master/contacts/:id/verification`

IAM authentication middleware always runs first. Missing, disabled, invalid or
initialization-failed adapters return `503 CONTACT_VERIFICATION_UNAVAILABLE`
without reading or modifying contact data. Configured adapters must pass explicit
resource authorization before execution. There is no successful verification stub.
Optional status is recorded in `container.services.contactVerificationStatus` and
sanitized startup diagnostics, not as a failing core readiness probe. Required IAM
and database health checks are unchanged.

The legacy Master Data registrar and local verification delivery registration were
removed. The generic entity runtime owns replacement address/contact workflows;
the old BP-specific contact authority was not restored.

## Current startup boundary

The host configuration module now imports successfully inside the development API
container. Full service registration still fails on the independently deleted
`composition/business-partner-case-authority.js`, imported by `register-services.ts`.
That module also retains a large legacy BP registration block mixed with generic
entity route registrations. It must be separated before the API can start.
Removing the complete block or replacing all services with empty stubs would
silently disable unrelated entity functionality; this change does neither.

No tests or database mutations were run. The API has not been restarted and login
has not been confirmed restored. The new package typechecks; the host's existing
deleted-module errors remain a separate blocker.
