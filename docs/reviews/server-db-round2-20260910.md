# Round 2 audit assessment — 2026-09-10

**Superseded:** the requested behavior and migration hardening are now implemented; see [Round 2 fixes](server-db-round2-fixes-20260910.md). The assessment below records the earlier contract.

The three comments do not establish new runtime defects. Applied documentation
and a behavioral regression for the discovery replay contract; retained deployed
migration contents and checksums.

| Comment | Assessment and action |
|---|---|
| AI call constraint compatibility | The premise confuses runs with calls. `20260909_atlas_tool_only_completion.sql` changes only `ai.ai_agent_run`. The erroneous call constraint references counters that exist only on runs, so PostgreSQL could not have installed it. The repaired call constraint retains the intended provider-final requirement. No evidence supports inventing a usage backfill or leaving this constraint unvalidated. |
| Discovery returns `requested` on replay | Confirmed behavior, consistent with other Mesh commands replaying `network_command_evidence.to_state` and the original resulting version. `status` is the command's original outcome, not a current-state read. Documented this at the canonical function and in the integration README; added a replay-after-withdrawal assertion verifying stable IDs/status and unchanged live state. |
| DROP CONSTRAINT without IF EXISTS | Not a repeat-application bug: the transaction drops and recreates the same named constraint, so the next application can drop it again. Existing real-PostgreSQL tests apply the repairs twice. Missing constraints represent unexpected baseline drift; retaining the explicit failure is reasonable. No change. |

For a manually altered installation, an operator can check call compatibility
before deployment using this read-only query. It returns only identifiers, not
prompts, responses, or fabricated usage:

```sql
SELECT id, tenant_id, outcome, usage_source
FROM ai.ai_agent_call
WHERE outcome = 'completed' AND usage_source <> 'provider_final'
ORDER BY id;
```

Any returned rows require investigation of that installation's schema/history.
The constraint migration remains transactional and fails closed; do not mark
unknown usage as provider-final just to pass validation.

Discovery consumers must read `mesh.network_relationship` and
`mesh.network_relationship_capability` through their authorized read path for
current status. A retry acknowledges the original command even after acceptance,
withdrawal, suspension, or termination; it does not re-create or reactivate it.

Validation: both migration/DDL parity tests passed; a fresh isolated PostgreSQL
16.13 Mesh foundation completed with 214 receipts; the Mesh behavioral suite,
including replay after withdrawal, passed. Whitespace checks passed. The
container was removed, and no application databases were modified. Logs use
`/tmp/athyper-db-round2-*.log`.
