# Fresh local QA baseline — 12 September 2026

Fresh isolated QA infrastructure is running with the existing IAM users preserved.
**This completes the database/isolation setup, not BP release qualification.**
DEV remains in source mode. No staging deployment or Git push occurred.

## Running configuration

- QA Compose project: `athyper-qa-candidate-1789163256545`.
- Existing URLs: `https://studio.qa.athyper.test`, `https://neon.qa.athyper.test`,
  `https://mesh.qa.athyper.test`, and `https://iam.qa.athyper.test`.
- Deployment checkout: `~/.athyper/candidates/20260912-bp/deployment`.
- Frozen successor: `~/.athyper/candidates/20260912-bp/frozen-v3`.
- Exact source: `a4dacc0da885d52b75d02f80c4a41bc0fc96c4ea`.
- All five candidate images were built and frozen locally; the six applications
  plus IAM passed the seven exact-image health/digest checks.

Use the deployment checkout for native `pnpm athyper ... qa` lifecycle commands.
Its QA template selects the isolated project; the ordinary repository template
still selects the old `athyper-qa` project. Do not run the ordinary template
against the isolated instance's ownership receipt. Deployment differences from
its committed source are the selected QA project and frozen ImageSet only.

## Preserved identity and data

The original QA Docker volumes still exist and none is mounted by a running
container. They were neither reset nor deleted. A private IAM database dump and
copies of the original controller receipts were retained before the switch.

IAM was restored into a new PostgreSQL volume. Verification confirmed unchanged
user, credential, role-mapping and required-action counts, including all 166 users.
`catl.admin` and `catl.owner` remain enabled. No passwords, MFA enrollments, human
approvals or user roles were changed.

Fresh product databases were initialized through Stack v2 using the candidate's
canonical DDL, followed by the native migration-baseline and forward runners.
The canonical three-plane tenant/authorization provisioner then ran with
`--skip-foundation --skip-keycloak`. It verified 28 Studio, 151 NEON and 54 Mesh
contexts, with three application projections in each plane.

The seed contains placeholder identity-provider subjects. The native
`reconcile-runtime-subjects.ts --apply` command resolved those bindings to the
retained IAM users. A subsequent live comparison verified both selected accounts
against their actual IAM subject IDs and original Cirrus principal IDs in all
three planes. Tenant ID remains `44444444-4444-4444-8444-444444444444`.
These are identity/seed checks; authenticated allow/deny behavior still requires
the QA journey below.

## Fixes found during startup

1. The foundation runner's temporary-file template was incompatible with Alpine
   `mktemp`; placing the random suffix at the end fixed fresh initialization.
2. Web services did not pass the instance domain suffix, so QA login defaulted to
   DEV IAM. The three web service configurations now pass it explicitly.
3. Retained IAM clients lacked QA callback URLs. The normal IAM admin API added
   exact QA callback/logout URLs and web origins. Existing client secrets matched;
   no service credential rotation was necessary.
4. Candidate tooling now resolves QA containers from the ownership receipt,
   accepting the standard QA project or the bounded isolated candidate naming
   format and rejecting foreign/DEV projects.

A browser check reached QA IAM sign-in from all three planes. The session-capture
helper resolves QA names to loopback inside its browser, so it does not require
editing operating-system DNS. Ordinary browser use still requires the usual local
QA hostname resolution.

## Evidence

All paths below are private local evidence, not published release acceptance:

| Evidence                                         | Location under `~/.athyper`                                |
| ------------------------------------------------ | ---------------------------------------------------------- |
| Original IAM/receipt recovery capture            | `qualification/qa-isolation/1789163134624/`                |
| Isolated-project preparation and identity checks | `qualification/qa-isolation/1789163256545/`                |
| Preserved-volume and IAM completion checks       | `qualification/qa-isolation/1789163256545/completion.json` |
| Native fresh foundation startup                  | `instances/qa/receipts/20260911T214858Z-up.json`           |
| Successor runtime startup                        | `instances/qa/receipts/20260911T220417Z-up.json`           |
| Successor's 248 passing regression tests         | `qualification/bp/1789164284641/receipt.json`              |
| Successor's passing artifact probe               | `qualification/qa/candidate-probe-1789164358531.json`      |

The probe used the actual candidate worker image and ordinary `athyper_worker`
database privileges. It verified native signature checks, tamper/wrong-plane
rejection, and database activation plus consumer reads, then rolled back all probe
state. Its ephemeral test signer does not establish QA release signing trust.
Eighteen controller/QA helper tests passed in the targeted run.

## Remaining BP qualification

- Capture existing-user QA sessions using the commands below. Normal MFA remains
  enforced; the helper verifies exact account, tenant and plane before saving.
- Configure the normal QA publication signer and authoring/dispatch/apply path.
  The standard stack currently leaves publication feature flags disabled. Do not
  reuse the probe signer or import DEV approvals as QA acceptance.
- Import/review/publish the frozen metadata through the native workflow, then run
  authenticated requester/independent-approver success and denial journeys.
- Bind that evidence to the frozen successor and perform independent acceptance.

```sh
pnpm qa:session --plane studio --actor catl.admin
pnpm qa:session --plane studio --actor catl.owner
pnpm qa:session --plane neon --actor catl.admin
pnpm qa:session --plane neon --actor catl.owner
```

Run capture commands in a graphical local terminal. Sessions are saved under
`~/.athyper/qualification/sessions/qa/<plane>/<actor>.json`; add `--check` to
revalidate. Never send passwords, MFA codes or session contents in chat.

The current qualification run reports all image checks passed but
`active-metadata:neon` failed, `handoffPassed: false` and `releaseQualified: false`.
This is expected: probe activation was rolled back and the candidate has not been
published into QA. Staging remains unavailable.

## Recovery boundary

The old volumes retain the previous database, including its failed legacy
migration ledger. Recovering that data is different from making the old schema
compatible with current application images. Stop the isolated project through its
native deployment checkout before selecting the old project/receipts; never run
fresh initialization against the old volumes. The original receipt and template
copies identify the old bindings. A data-preserving upgrade is a separate milestone.

## Credential-readiness correction

A subsequent login investigation found that both selected accounts had **no password or MFA credential** in the original IAM backup or the restored QA database. Preserving aggregate credential counts did not establish that those accounts could sign in. The accounts and roles were preserved, but initial password setup and MFA enrollment are prerequisites for the authenticated qualification. IAM logged `invalid_user_credentials`; QA routing was working.

## DEV-to-QA first-load credential completion

At the user's request to replicate DEV IAM setup, the missing credentials for
`catl.admin` and `catl.owner` were imported through Keycloak's native user-update
API. Both had zero QA credentials; the tool refuses to overwrite initialized
accounts. Password hashes and OTP enrollment were transferred privately from DEV
and verified against the stored QA representations. Plaintext passwords were not
read, and no OTP code was generated or submitted by the agent.

QA user IDs, product principal mappings, total user count and role-mapping count
remain unchanged. Exactly four credentials were added (password and OTP for each
account). Users can now sign in using their DEV password and existing authenticator
entry. Successful human login and candidate acceptance remain pending.

Sanitized receipt:
`~/.athyper/qualification/qa-first-load/1789165531660/receipt.json`.
The guarded implementation is `tooling/scripts/local-dev/qa-iam-first-load.mjs`.
A repeated import was verified to refuse overwriting the initialized accounts.

The admin-console screenshot showed the `master` realm. Application users are
already present in the `athyper` realm; a full realm replacement was unnecessary.

## Subsequent publication qualification

The QA BP form/workflow bundle is now natively signed and activated in NEON.
Full release qualification still fails on elevated-session evidence and the
missing product entity descriptor/operation bindings. See
[the publication qualification report](qa-publication-qualification-20260912.md)
for exact release, artifact, deployment and test receipts; do not interpret the
metadata handoff as a successful complete BP journey.
