# Atlas Gemini evaluation assets

Phase 3 reuses the Phase 2 comparison set without editing it:

- common fixture: `atlas-openai-eval-v1.json`;
- pinned common version: `1.0.0`;
- pinned common SHA-256:
  `2B7C8677E69CAD690AAA1F1550F656DA57E36C014502BAA9E3648678ED02BF05`;
- common cases: 200;
- Gemini add-on: `atlas-gemini-eval-addon-v1.json`;
- Gemini-specific cases: 30;
- combined treatment inventory: 230.

The add-on covers five cases in each of:

- safety-block normalization;
- long-context behavior;
- prompt-level JSON adherence;
- multi-function-call ordering;
- selected-model request-parameter compatibility; and
- quota, project-limit, and account-policy behavior.

The validator recomputes the common fixture hash before normalizing the add-on.
Changing the Phase 2 file therefore fails the Gemini gate instead of silently
creating a different comparison treatment.

The first Phase 3 binding is text-only. Multi-function cases use recorded
provider-native fixtures and validate only adapter normalization. They do not
authorize live tools. JSON cases measure prompt-level adherence; they do not
claim native structured-output support.

`gemini-provider-lifecycle-v1.json` pins the exact internal binding, model, API
surface, SDK package/version, review date, blocked retirement models, and
replacement-rehearsal deadline. Its regression test intentionally fails after
an overdue lifecycle review or rehearsal so CI becomes the lifecycle alert.

Run:

```text
pnpm --filter @athyper/svc-ai exec vitest run \
  __tests__/atlas-gemini-eval-set.test.ts \
  __tests__/gemini-provider-lifecycle.test.ts
```

Both datasets contain inputs and expected behavior only. They contain no model
responses, customer content, scores, winners, or production evidence.
Evaluation results must be stored separately with the exact dataset IDs,
versions, hashes, binding, model, project, account class, and region.

The approval and evidence procedure is documented in
`docs/runbooks/atlas-agent-phase3-gemini-evaluation.md`.
