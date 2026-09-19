# Atlas F3 — structured intent, clarification and response feedback

F3 extends the F2 shared runtime with validated routing decisions, exact-term paraphrase handling, safe clarification/denial responses and feedback bound to a specific completed response. It uses current registered section aliases and the published AI catalogue; it does not activate unreviewed vocabulary or change model weights.

## Runtime behavior

`AtlasIntentV1` records a versioned kind (`read`, `clarify`, `delegate`, `denied`), strategy, reason and bounded capability IDs. Decisions are validated, stored in message input lineage and streamed through the additive `intent.resolved` event. Only admitted capabilities are selected for execution. Missing/denied capabilities never become permissions through intent matching.

- Exact aliases support wording such as “display this supplier's contacts”, “give me the contacts for this partner” and “tell me about the current contacts”. Unicode normalization and token boundaries avoid substring guesses.
- Multiple matching sections prompt the user to name one. Explicit mutations, negation, historical queries and unresolved names stay outside the direct read path. Unsupported filters retain the section renderer's existing explicit limitation response; they do not become SQL predicates.
- A native Records `RECORD_LIST_SCOPE_REQUIRED` result becomes work-context clarification. Typed denied record/capability reads produce a safe access response without exception details or an absence claim. Selecting company/account context remains an explicit page action; typed chat names never apply it.
- Known but unadmitted section requests produce an unavailable response without revealing hidden capability names. Unknown wording delegates to the existing model/owner path. BP readiness, eligibility and governed commands retain their owner rules.
- Static clarification and denial skip model invocation and quota reservation, preserve the requested page generation for the client, and persist no invented citations. A denied direct read can still have a real attempted-tool ledger row.
- The UI labels clarification/unavailable outcomes. Exact completion message IDs are preserved alongside run IDs for feedback. Existing saved-message rendering and disclosure checks remain authoritative; intent labels are not inferred from old prose.

## Zero-model persistence and metering

The repository permits completion without provider usage only for a verified durable read or an exact, server-owned static guidance message. A guidance completion must contain one canonical text block, no citations, no read evidence and no provider calls. Arbitrary text with a guidance marker is rejected.

`ai.ai_agent_run.guidance_code` identifies `ambiguous`, `missing_scope` or `access_denied`. SQL constraints require completed status, zero model calls, unavailable provider usage and null token/cost/provider fields. No model token count or provider identity is fabricated. Tool-call counts come from actual scoped invocation rows, including denied attempts.

## Feedback contract

`POST /api/atlas/feedback` accepts only:

```json
{
  "schemaVersion": 1,
  "feedbackId": "10000000-0000-4000-8000-000000000001",
  "runId": "10000000-0000-4000-8000-000000000002",
  "messageId": "10000000-0000-4000-8000-000000000003",
  "category": "intent",
  "verdict": "wrong"
}
```

Categories are vocabulary, intent, missing context, unsupported capability, owner failure, evidence and presentation. Verdicts are correct, wrong, partial and missing. IDs above illustrate shape only; use coordinates from a completed response.

The service requires current plane AI permission and response disclosure authorization. The repository rechecks same-tenant, same-plane, owning-principal, completed-run/assistant-response coordinates, conversation visibility and retention inside the transaction. A composite foreign key also binds feedback to the run's exact output message, plane and principal.

Storage reuses `ai.ai_feedback_log` and the existing `atlas_agent` lookup type. `target_id` is the run ID; `atlas_response_message_id` and `atlas_response_plane` make response coordinates explicit. Versioned `detail` and `evidence_snapshot` store the category, input intent and policy/binding revisions. No transcript, data values or freeform corrections are copied. `is_outcome_verified` remains false. Legacy feedback rows without response coordinates remain valid.

Identical retries with the same feedback ID return the existing receipt; changed content or ownership conflicts are rejected. The UI retains the same receipt ID after a failed attempt and disables resubmission after success. F4 review must treat repeat reports from one response/actor as correlated signals, not independent votes. No category automatically creates a learning candidate or updates published metadata.

## Deployment and verification

Apply [20260910_atlas_intent_feedback.sql](../../server/db/migrations/20260910_atlas_intent_feedback.sql) through the existing forward-migration runner before deploying this host version. It is registered in all three plane manifests. Fresh installations receive the same columns and constraints from common AI DDL. Then deploy the matching host, contract and UI changes. Keep the F2 entity descriptors and scope owner configuration.

The migration is additive. Prior code can continue writing legacy feedback and metering rows; rollback of application code does not require dropping the new columns or deleting feedback. This implementation did not apply migrations or publish changes to DEV/QA.

Verification entry points:

- `pnpm --filter @athyper/server-platform-ai test` — paraphrases, ambiguous/unsupported wording, denied pre-discovery and execution, zero-model runtime behavior, repository completion, feedback validation and route schema.
- `pnpm --dir server/db test:integration:atlas-f3` — creates its own disposable PostgreSQL container; builds each plane from canonical DDL, verifies forward upgrade, invokes real repositories under the NOBYPASSRLS runtime role, checks zero-model metering and rejects arbitrary guidance prose, mismatched response coordinates, changed retries and foreign actors/tenants. Cleanup removes the container. It accepts no deployed target.
- Existing Atlas client, context and workspace tests cover structured stream parsing, exact response IDs, feedback retries and disclosure/navigation behavior.

The three-plane PostgreSQL run passed 12 grouped checks. Live deployment, browser wiring against that deployment and live-model held-out evaluation remain release qualification work. English exact-term handling is covered; no multilingual or fuzzy-name qualification is claimed. F4 remains responsible for candidate review, evaluation and publication of vocabulary changes.

Final source validation: 350 platform-AI tests, 20 AI-contract tests, 9 targeted host tests, 12 Atlas client-contract tests and 20 targeted UI/context tests passed (411 total). Six package typechecks passed. Root test reachability and whitespace checks passed, and all disposable F3 containers were removed.
