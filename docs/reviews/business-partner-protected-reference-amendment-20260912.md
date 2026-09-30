# Protected-reference correction — NEON qualification

Proposal revision: **52c03baf5ccdd276558ca8533a6e3927233bbc61c1f0c28f519edbfcba880c8d**

The approved 5c431665 amendment stopped before creating a secret, applying either migration, or changing the active runtime. Its Infisical URL used a reference containing slashes as a secret name. The deployed Infisical schema rejects slashes and colons; the long route also returned a generic route 404. That result was incorrectly treated as an absent secret during preparation.

The corrected adapter maps incompatible references to a bounded SHA-256 name and keeps existing compatible flat names unchanged. Both reads and writes use the same mapping. This adds one compiled adapter file to the earlier candidate; all earlier fixture, audit and host-registration changes remain included.

- Current image: sha256:09f65ba5550ab4344ecf46dd627c1060b173652c8b65029b778e31b2f1882f0a
- Corrected image: **sha256:05907dc2e051dec838ef29bd27416add855f9fb437aecd4841d4a5ef9bbe0036**
- Release-set binding: **dd00cbf836e81d3c6185559fa77b5d27e92e547a7123ba8160cea0c732303735**
- All five signed artifacts remain pinned to the preceding proposal.
- Logical secret reference: protected-values/44444444-4444-4444-8444-444444444444/qualification.bp.finance-reveal.01d4baa18931c720.bank
- Infisical physical key: athyper_ref_3968521d7cc032fc6501b1adafe379071783fb1e7ca375d0c20135af354c3271
- Project/environment/path: ed696684-8309-4e0f-903a-8adece9246b7 / dev / /

Four adapter tests and TypeScript build passed. The canary returns health 200 and a TLS-verified structured Secret NotFound response for the mapped key. No secret has been created. Tests cover tenant separation, bounded names, flat-key compatibility and matching write/read coordinates.

Approval permits deployment of this corrected image, the previously reviewed two-event audit contract and synthetic bank fixture, and creation of the same one synthetic secret under its mapped physical key. Existing records and secrets are not overwritten. No grants are added, restored, renewed or extended; the current execution window still ends at **16:00 MYT on 12 September 2026**. The retained fixture and synthetic secret will be inventoried together.

This supersedes only the unapplied runtime amendment 5c4316658e4dc8205ca620e4f008a7ef2e360c4dc603eaec06c951fe8a213c57. It does not accept the 66 policy dispositions, activate enforcement, retire compatibility, or expand scope beyond NEON. Positive reveals, final-image comparisons, revocation and recovery remain to be executed.
