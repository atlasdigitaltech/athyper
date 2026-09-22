# CA-10 local publication and signed-in acceptance

Verified 2026-09-22 in the local DEV source runtime. Business Partner capability
publication/activation and the signed-in NEON acceptance pass are complete.
The broader CA-10 second-entity and cross-plane acceptance remains open.
Office and encrypted-document previews remain unsupported.

## Activated capability definition

A candidate was compiled from the live release-12, 95-artifact baseline. Only
`business_partner/operation` (preview/extract/search and processing binding) and
`business_partner/presentation.section.attachments` changed; the other 93 hashes
were preserved. A repeated compilation produced the same scoped candidate hash.
Unrelated working-tree metadata changes were not included.

The existing local DEVFULL author/publisher service accounts authenticated using
their configured credentials and scopes. The publication envelope was signed
with the existing Infisical-backed Ed25519 key and verified before publication.
No human review was impersonated. The publisher now rejects mutations without
scoped workload authority and a pinned baseline head; the previous development
checksum is not accepted as a signature. Native BP intake definitions were not
changed. Existing publication/staging/activation functions applied the release.

- Publication key: `metadata.compiled_entity.business_partner`
- Studio release: **13**, `2c50384b-c70b-5c70-b59a-0f1573b9209e`
- NEON applied release: `01a0c746-992b-7b64-a316-2a2b2bfba131`
- Activated: `2026-09-22T04:01:27.862386Z`
- Envelope hash: `9e12611779c1a8c12abb7d2197d81971f56dd55bb029bfe9d5193ec5e11e5a77`
- Compiled release hash: `sha256:f9bdc342cd7eac381686d856668306d79975d2725578239bf45d731fb2d82f67`

[Publication receipt](evidence/ca10/publication.json),
[Studio read-back](evidence/ca10/studio-receipt.json), and
[NEON head read-back](evidence/ca10/neon-receipt.json) agree.
This is local source-runtime activation, not an immutable image or integration
commit qualification. Frozen metadata is held in the owner's private candidate
workspace; no credentials, tokens, signed object URLs or private keys are included
in repository evidence.

## Signed-in acceptance

The refreshed CATL admin browser session successfully performed these operations
against the real local services and the activated capability definition:

- Upload the 1.3 KB clean PDF fixture, finalize and scan it; produce clean preview
  and first-page thumbnail derivatives. A signed PDF byte-range read returned
  `206` and the expected PDF header.
- Open the actual PDF viewer and close it; closing removed its iframe while the
  thumbnail remained available.
- Search the exact record for `CA09` after extraction completed and find the
  fixture. The earlier search before asynchronous extraction finished had no hit;
  extraction progress is not inferred from temporary search availability.
- Create a folder; save and filter the Evidence category.
- Post a comment and observe the composer clear; submit an inline reply without
  a browser prompt; toggle Like and Unlike.
- Unlink the two disposable uploads, remove both created folders, and remove the
  acceptance comment/reply. The original attachment was retained. Unlinked bytes
  remain subject to ordinary retention rather than forced purge.
- Confirm the removed PDF is absent from record search and a new preview request
  returns `404`. Anonymous NEON access returns `401`.

[Signed-in results](evidence/ca10/signed-in-ui.json),
[upload/preview results](evidence/ca10/pdf-upload-preview.json),
[cleanup](evidence/ca10/cleanup.json), and
[access checks](evidence/ca10/access-and-cleanup.json) record the outcomes.

## Repairs and focused verification

Live acceptance exposed and repaired missing replay-key forwarding into attachment
admission, missing finalize/unlink client keys, missing category/archive relay
registrations, and archive read-preflight incorrectly requiring mutation tokens.
Read-preflight still performs permission checks and cannot be enabled by a request
body field. Pending uploads no longer request a derivative before becoming active.

The missing `document.attachment_workspace` table was added using the canonical
additive upgrade, rehearsed with rollback and then applied to local Neon, Studio
and Mesh, including tenant RLS and existing application-role grants. No data reset
or permission bypass was used.

Focused checks: 74 attachment tests, 19 capability-policy tests, 34 relay tests,
2 attachment-client tests and 4 scoped-publication tests pass. Affected collaboration
UI, BP, form-detail and publisher TypeScript checks pass.

## Remaining broader acceptance

- An appropriate second entity has not been activated or exercised. Shared
  renderer reuse must still be demonstrated through its published metadata and
  explicit domain admission provider.
- Studio and Mesh web endpoints returned `503`; this is unavailable infrastructure,
  not a successful cross-plane authorization test. Their signed-in checks remain
  unverified. NEON anonymous denial was verified separately.
- Mention/inbox delivery was not accepted in this pass. Existing workflow inbox
  polling returned `403` independently of the successful collaboration requests.
- Optional provider integrations, superseded-wrapper removal and parent Phase 7
  acceptance are not implicitly completed by this local capability activation.

Gotenberg retains restricted HTML-to-PDF duties. The separately qualified internal
image/PDF derivative provider remains the preview provider; a health response alone
is not protocol qualification. See [CA-09 qualification](entity-comments-and-attachments-ca09-qualification.md).
