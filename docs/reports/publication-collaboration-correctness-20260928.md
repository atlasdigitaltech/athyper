# Publication and collaboration correctness — Phase A / B

Status: source changes, local regression checks, DEV database isolation and
Neon signed-in acceptance complete. No publication, activation, or mutation of
existing signed payloads was performed. The DEV source-watching API loaded the
source changes; QA was untouched.
Country's live release and capability settings are unchanged. No BP metadata was
introduced.

## Phase A

- Runtime compatibility now compares major, minor, then patch numerically.
  Supported syntax is `major.minor.patch`, optionally followed by SemVer
  prerelease and build identifiers. Core numbers must be nonnegative safe
  integers without leading zeros. Numeric prerelease identifiers cannot have
  leading zeros. Whitespace, `v` prefixes, partial versions, and version ranges
  are rejected. Build metadata does not affect ordering; prereleases precede
  the corresponding stable version. Malformed versions fail closed with
  `RUNTIME_INCOMPATIBLE`, including malformed host versions without a declared
  minimum. Tests exercise the actual loader with signed publication fixtures,
  not only a standalone comparison function.
- Shared capability action metadata supplies permissions, handlers, concurrency,
  profile idempotency defaults, and validator minimum-idempotency requirements.
  Existing compatibility rules are retained. Explicit/profile lowering parity
  is tested with attachment categories both enabled and disabled.
- Filter shapes and relative-date tokens are checked before SQL construction,
  including the direct repository entry point. Malformed values return 400
  `INVALID_FILTER_VALUE`; unsupported operators return 400
  `FILTER_OPERATOR_NOT_ALLOWED`. Field/operator authorization is still enforced.
  Query admission uses the existing `MAX_LIST_FILTERS` constant.
- Request transaction coordination rejects absent tenant/principal context.
  Experience repository reads validate context before invoking a runner and
  stamp newly created transactions only. Existing transactions retain their
  coordinator-established actor: repository arguments must not replace that
  identity. Missing settings remain missing and RLS fails closed. The generic transaction
  runner remains usable without an actor for deliberate system operations;
  making that generic utility universally tenant-only would break a different
  contract. This does not authorize actorless HTTP request execution.

## Phase B

- Open version history stays visible while its changed revision is fetched.
  Cache/request coordinates include session scope, entity, record, attachment,
  series, and revision/version. Replacing an unchanged items array no longer
  causes repeated history requests.
- History requests are aborted when coordinates change or the component
  unmounts; late results are also ignored. Removed attachments are excluded
  from pending history coordinates. Changing tenant/record scope clears open
  history and its cache.
- A browser test reproduced two painted pinned frames before restoring a saved
  unpinned deep link. Preference restoration now runs before paint. The same
  regression test passes after the change.

### Independent zero semantics

| Limit | Meaning of zero |
| --- | --- |
| Upload bytes | Reject new create/version/finalize admission, including requests omitting size. Existing-file reads/downloads remain available. |
| Upload batch count | Reject new create/version/finalize admission, including requests omitting batch count. |
| Comment text length | Reject nonempty text. Empty/omitted text does not by itself violate this limit; normal comment-content validation still applies. |
| Attachments per comment | Reject nonempty attachment references. Empty/omitted references are allowed by this limit. |

Positive limits retain their existing checks. These controls remain separate:
per-comment references are not an upload batch, and neither is a lifetime
record attachment count. Admission tests cover populated and omitted optional
fields. This change does not introduce a cross-request upload-batch ledger.

## Verification

| Suite | Result |
| --- | --- |
| Publication service (including signed-loader version cases) | 367 passed |
| Publication contracts / profile parity | 167 passed |
| Records service / filter validation | 306 passed, 3 skipped |
| Experience capability policy / effective controls | 153 passed |
| Database transaction core | 22 passed |
| Experience repository context unit checks | 5 passed |
| DEV PostgreSQL localization / RLS, across all three planes | 18 passed |
| DEV experience identity/profile/catalog/features, one run per plane | 3 passed |
| Collaboration / file-discovery browser regression | 66 passed |

The history browser test was rerun after the final removed-attachment request
guard and passed. Relevant publication, records, UI, and database-core type
checks passed; the experience adapter build passed. `git diff --check` passed.

### DEV follow-up

The user authorized testing directly against local DEV. Tests targeted Docker
container `athyper-dev-db-1`, physical databases `athyper_studio`, `athyper_neon`,
and `athyper_mesh`; assertions ran as `athyper_runtime` (not superuser and not
BYPASSRLS). QA containers/databases were not used. Existing active tenants and
principals supplied the fixtures. Localization test writes were rolled back;
experience projection checks were read-only. The separate empty/disposable
database provisioning suite was deliberately not pointed at populated DEV.

The first live RLS run caught nine failures caused by the previous change
re-stamping an already-scoped transaction. This let substituted repository
coordinates change its actor. That change was corrected: existing transactions
retain their original context, while newly created transactions are stamped.
The same 18 PostgreSQL checks then passed, covering cross-tenant reads/writes,
same-tenant other-principal writes, absent settings, forced RLS, and physical
plane identity. The five context unit checks were updated and passed. All three
experience projection checks also passed against actual DEV fixtures. Their
catalog-order assertion needed a test correction: the actual SQL groups by
workspace sort order **and workspace code** before module order/code. The old
assertion incorrectly interleaved modules when two workspaces shared the same
sort order. No production catalog ordering was changed.

Neon signed-in acceptance passed as `catl.admin` on Country Afghanistan:
comments, replies, reactions, history, PDF upload/finalization, extraction,
preview generation/delivery (HTTP 200), and content search finding the uploaded
marker. The active release remained
`fd5d1272-8447-4a50-a59d-d2c0d6997a48` (release 6).

Neon live list checks returned 200 for a valid request, 400
`INVALID_FILTER_VALUE` for object-valued equality and object elements in `in`,
and 400 `INVALID_FILTER` for a malformed range and unsupported relative date
(rejected earlier by the route parser).

Synthetic acceptance data retained in DEV for inspection:

- Comment: `01a0e4c0-d5b2-7542-af9a-471fc452f471` (private), with one reply/reaction.
- File: `acceptance-4f3e5d0e.pdf`, attachment
  `4f3e5d0e-0815-4e50-ace7-feb309a3c1d7`, 1,415 bytes.
- Search marker: `COLLABACCEPTANCEF722211E7D77423F863845D3E11A2D4A`.

Studio and Mesh captured `catl.admin` sessions initially returned anonymous.
The user subsequently reported refreshing them and requested that these
signed-in tests be left for manual review. No automated signed-in writes were
performed there; their database isolation checks have passed. Neon
alternate-user sessions were also expired at inspection, so this run does not
claim signed-in cross-user authorization acceptance.

Compiler/action-generation changes must follow the existing compiler
qualification, approval, signing and target-receipt workflow before any future
successor publication. No approved compiler fingerprint or signature check was
bypassed by this work.
