# Local QA publication qualification — 12 September 2026

Status: **signed metadata handoff passed; full release qualification has not passed**.

## Verified deployment and publication

The isolated QA project is `athyper-qa-candidate-1789163256545`. The frozen candidate remains `~/.athyper/candidates/20260912-bp/frozen-v3`, application source `a4dacc0da885d52b75d02f80c4a41bc0fc96c4ea`. All seven running API, worker, scheduler, frontend and IAM images match its exact image digests. DEV release 20, its evidence and the old QA volumes were not modified.

The existing Cirrus accounts authenticated separately. `catl.admin` simulated and imported the frozen BP definition; `catl.owner` independently published it through the Studio BFF and native service. The checker was denied authoring and the maker was denied publication (HTTP 403). These are automated authorization journey receipts, not independent human semantic acceptance.

| Coordinate                    | Value                                                              |
| ----------------------------- | ------------------------------------------------------------------ |
| QA Studio definition revision | `35236996-a1e7-426b-8ddb-b607bec8d47c`                             |
| QA publication release        | `1946f17e-709a-4c39-b56f-849283693a2d` (QA release 1)              |
| Signed artifact               | `45b9c987-07bd-4d06-85fa-a650bb5f1a6a`                             |
| NEON deployment               | `01a092ae-eb7f-7fe2-a152-0a6c2be837a2` — activated                 |
| Signing key                   | `athyper-qa-publication-ed25519-20260912`                          |
| QA Infisical project          | `c3764e8e-2db7-4d7b-a714-49407ffb6936`                             |
| Public key SHA-256            | `d7c6ff60c5e7ada1aa70733b8016ac54adfd15da27e5b4d2689ec0308f55a3d5` |

The signing key and read-only service identity are independent of DEV. Only the local Infisical service infrastructure is shared. Its existing administrator bootstraps the QA project; the QA checkpoint does not copy that administrator credential. The QA TLS proxy joins a dedicated provider network and the QA application network. No DEV application network is joined.

The first signing job exhausted its attempts because the TLS proxy could not read its owner-only configuration after capabilities were dropped. Running the proxy as the owning host UID/GID fixed this. Recovery retried the existing failed signing job, scoped to the already approved release and its compilation IDs. It did not change release approval. The resulting artifact is signed, its deployment is activated, and NEON's authenticated active-form response names that release.

## Repeatable operations and evidence

The Stack v2 controller now loads a strictly validated, owner-only QA publication overlay for an isolated QA project. Validation rejects DEV trust, extra environment settings, application image overrides and disabled signature verification. Native `pnpm athyper up qa --confirm qa` succeeded from the candidate deployment checkout and retained the overlay in the active receipt.

The deployment checkout contains the new controller loader/plan integration in addition to its QA instance and image-set configuration. These controller changes are not part of the frozen application source commit; application images were not relabelled or rebuilt. Full promotion must bind the final controller/configuration content as well as the application candidate.

Local receipts:

- Native Stack v2: `~/.athyper/instances/qa/receipts/20260911T230808Z-up.json`.
- Initial native publication and role denials: `~/.athyper/qualification/qa-publication/1789167142392/receipt.json`.
- Repeated authenticated publication: `~/.athyper/qualification/qa-publication/1789167520824/receipt.json`.
- Grant rehearsal after application: `~/.athyper/qualification/qa-grants/1789168075202/receipt.json`.
- Strict current-session run: `~/.athyper/qualification/qa-publication/1789168358281/receipt.json` (normal maker-session refresh returned HTTP 401; no publication attempted).
- Metadata handoff after native restart: `~/.athyper/qualification/qa-publication/metadata-handoff.json`.
- BP command boundary: `~/.athyper/qualification/qa-bp/1789167873455/receipt.json`.

The fresh seed placed these accounts in zero-grant quarantine groups. Explicit product grants were therefore necessary despite successful IAM login. Studio grants are tenant-exact read/author for the maker and read/publish for the checker. NEON grants are the catalog-supported operating-organization subtree case permissions: create/read/update/validate/submit/materialize for the maker, read/decide for the checker. Existing memberships were retained. IAM identities, credentials, MFA policies and permission catalog requirements were not changed.

`qa-journey-grants.mjs` rehearses both grant transactions by default; `--apply` applies them only to the ownership-receipt-identified isolated QA database. SQL constraints and role separation remain active. Rehearsal after application passed, demonstrating idempotence.

Ten focused Node tests passed: candidate integrity, environment/account mapping, QA session identity and strict publication-overlay boundaries. Windows PowerShell execution cannot be verified in this Linux terminal.

## Unmet qualification prerequisites

1. **Elevated session evidence is not present.** The refreshed saved owner files and the corresponding server-side QA records still report baseline assurance. Earlier native publication responses are retained as observations; they do not prove the separate elevated-review evidence requirement. The harness now fails closed before publication when its reviewer session is not explicitly elevated. The new PowerShell `-Elevated` option invokes interactive OIDC step-up and automatically validates/synchronizes the result. Terminal output has been requested to diagnose why no elevated capture reaches this workspace. Passwords and OTP generation are not automated.
2. **The candidate is not a complete product metadata dependency set.** QA has no active `business_partner` entity descriptor. The real NEON `/mdg/business-partner/new` browser page reports `No active descriptor for business_partner`. The signed form/workflow bundle does not supply this separate descriptor.
3. **The BP command journey does not pass.** The checker-create and wrong-organization calls are denied. The maker's valid-scope stale-form test also returns authorization denial instead of reaching the expected stale-form rejection. Fresh QA lacks the published entity operation bindings required by the command authorization engine. No successful draft, validation, submission, independent decision or materialization is claimed.
4. **Independent release acceptance remains pending.** Neither the prior development evidence nor an automated reviewer session is substituted for exact-candidate semantic acceptance.

The remaining engineering work is to export and bind the required entity descriptors and operation contracts alongside the BP definition, import them as new QA authoring revisions through native catalog/authoring controls, obtain the required QA review, sign and activate that dependency set, then rerun the browser and command journeys including denial/revocation boundaries. The current `candidate:qualify` command deliberately reports `releaseQualified: false`; its successful result covers metadata handoff only.

No runtime descriptor rows, approval records or permission requirements were patched to make qualification pass. Staging remains unavailable and nothing was promoted.
