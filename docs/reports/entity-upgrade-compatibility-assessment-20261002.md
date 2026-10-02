# D7 Entity upgrade compatibility assessment — 2026-10-02

Controlling deliverable: [foundation roadmap D7](../architecture/foundation-cleanup-plan.md).

This change is necessary for this Entity onboarding guarantee: schema-dependent
onboarding must have an executed, reproducible upgrade path from its supported
starting database. This assessment adds qualification tooling; it changes no
entity definition, publication, authorization policy or serving runtime.

## Implementation

The [baseline matrix](../../server/db/migrations/compatibility-baselines.json)
declares two reconstructed paths and explicitly unresolved legacy/installation
paths. `pnpm qualify:entity-upgrade-compatibility` captures its inputs and uses the
existing foundation and forward runners in network-isolated disposable databases.
Foundation DDL runs only on fresh databases. Active forward SQL keeps its original
bytes and ledger identity. Each plane executes independently so an earlier-plane
failure cannot conceal later-plane outcomes.

The command requires populated Country and Principal tables, plans row-content
preservation and complete applied-receipt/checksum checks, and checks exact retry
receipts after a successful forward sequence. Failure logs and durable migration
states are retained. Arguments naming database URLs, containers or undeclared
baselines are rejected before any artifact creation or Docker invocation.

## Executed evidence

The assessment ran on 2 October 2026, 08:52–08:56 Asia/Kuala_Lumpur.
Its private packet is:

`~/.athyper/instances/dev/artifacts/entity-upgrade-compatibility/2026-10-02T00-52-33.684Z-1942009/`

`source-manifest.json` identifies the captured input files; `source/` retains their
bytes. The SHA-256 of the serialized source index is
`5993021382263b5a66803a8b58e51ba8d37fd0d25975d3f03d8686796358cd88`.
`qualification.json` records baseline, plane, image identity, foundation inputs,
initial row counts/hashes, migration receipts and failures. Foundation/forward
stdout and stderr are retained separately per baseline and plane. An earlier
format-sensitive matrix comparison failure remains in the earlier packet; it
executed no database path and is not qualification evidence.

| Baseline                         | Studio foundation | Neon foundation | Mesh foundation | Forward outcome            |
| -------------------------------- | ----------------: | --------------: | --------------: | -------------------------- |
| `canonical-current`              |      261 receipts |    267 receipts |    228 receipts | Failed on all three planes |
| `canonical-pre-principal-source` |      260 receipts |    265 receipts |    227 receipts | Failed on all three planes |

All six fresh foundations installed successfully. Each contained 247 Country rows
and one bootstrap Principal. Profile and identity-binding tables were empty;
this run provides no populated Profile/binding preservation coverage.

All six forward paths failed with the same plane-specific blockers:

| Plane  | Migration                                       | Failure                                              |
| ------ | ----------------------------------------------- | ---------------------------------------------------- |
| Studio | `20260926_entity_execution_binding_storage.sql` | `metadata.entity_change_case_binding` already exists |
| Neon   | `20260928_record_history.sql`                   | `snapshot.record_version` already exists             |
| Mesh   | `20260928_record_history.sql`                   | `snapshot.record_version` already exists             |

Canonical Studio metadata DDL and common snapshot history DDL already install
these tables. Their active forward migrations attempt unconditional creation on
a database without corresponding migration-ledger receipts. The real runner
records `failed` and locks the migration for operator review. Subsequent migrations,
final preservation assertions and successful exact retries were **not reached**;
their presence in the tool is not passing evidence. The command exited nonzero.
No deployed database or migration receipt was changed. Both containers were removed.

Additional executed checks: migration layout passed (105 classified files,
97 retained SQL files); three command-target rejection tests passed; JavaScript
syntax and targeted formatting passed. These establish tooling/layout checks,
not upgrade acceptance.

## Assessment and required follow-up

**D7 remains open. No complete forward path is qualified by this run.** The
reconstructed paths do not establish compatibility with the archived 14 September
baseline or actual DEV/QA installations. Publication/activation, runtime owner
authorization and browser journeys were not exercised.

1. Reconcile canonical fresh installation with active forward-migration receipt
   ownership. Preserve installed SQL hashes and historical ledger identities;
   establish exact schema prerequisites before treating any canonical-installed
   capability as already satisfied. Blind receipt insertion or ledger reset is
   not an upgrade proof. This task belongs to shared DB foundation/runner ownership.
2. Re-execute both complete manifested paths, including all later migrations,
   populated-data preservation and exact retries. Qualify any schema/function
   differences against the intended target rather than assuming successful SQL
   establishes canonical equivalence.
3. Declare the exact supported historical starting schemas and captured populated
   fixtures. Original manifests alone do not reconstruct them. Map actual DEV/QA
   schema and receipt state to those paths; retain unresolved installations as
   unqualified. This task needs installation/baseline ownership evidence.
4. Expand fixtures to populated tenant/domain records, profiles and bindings and
   obtain the relevant Entity publication/runtime qualification. Record source,
   baseline and target identities and every intended-plane outcome separately.

Schema-dependent onboarding still requires its relevant supported-baseline D7
qualification. Neither the new matrix nor successful fresh foundation installation
waives that gate.

## Follow-up: reconstructed paths repaired — 2 October 2026

The earlier six failed outcomes are retained as historical attempts. The final
rehearsal at 10:09–10:13 Asia/Kuala_Lumpur passed all six complete reconstructed
paths. The runner now verifies checksum-bound canonical equivalents before
adopting an already-installed capability. It never uses relation existence alone,
rewrites retained SQL, or resets failed migration receipts. A narrowly scoped
Studio prerequisite supplies the historical publication grantee without granting
login, membership or application access. See the migration README for the exact
compatibility boundaries and admitted canonical supersets.

| Baseline                         | Studio              | Neon                | Mesh                |
| -------------------------------- | ------------------- | ------------------- | ------------------- |
| `canonical-current`              | Passed: 31 receipts | Passed: 18 receipts | Passed: 14 receipts |
| `canonical-pre-principal-source` | Passed: 31 receipts | Passed: 18 receipts | Passed: 14 receipts |

Each Studio path has five validated canonical equivalents; Neon and Mesh each
have two. The remaining migrations execute through the unchanged forward SQL.
Complete receipt arrays and populated row hashes match after exact retries.
All six databases preserve 247 Country rows and one bootstrap Principal. Profile
and identity-binding fixtures remain empty; they do not qualify populated domain
preservation. The rehearsal passed 72 equivalence probes, including denial of
provisioning-receipt drift, altered RLS, extra mutation grants, disabled immutable
triggers, changed defaults, missing binding constraints and changed permissions.
History reconstruction with the original SQL plus the canonical administrator
grants also passes the catalog comparison.

Private evidence:
`~/.athyper/instances/dev/artifacts/entity-upgrade-compatibility/2026-10-02T02-09-42.157Z-322531/`.
The captured source index SHA-256 is
`aff2356c76e95fa91afd5bfca1b8eb817f2de1b0f359914fa628b4da45e90082`.
`qualification.json` records `passed: true` and `d7Complete: false`.

D7 remains open for exact historical and deployed starting schemas, populated
Profile/binding/domain fixtures and intended deployment/runtime qualification.
No deployed database, publication, activation or user data was changed by this
repair. Earlier failing runs and negative probe logs remain preserved.
