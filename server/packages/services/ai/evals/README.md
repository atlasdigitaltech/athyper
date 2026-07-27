# Atlas OpenAI evaluation fixtures

`atlas-openai-eval-v1.json` is the immutable version 1 input set for the
internal-only Atlas OpenAI profile. It contains 200 wholly synthetic cases:
25 cases in each of eight required categories.

The JSON keeps common messages, assertions, risk, category, and rubric metadata
at the family level. `validate-atlas-openai-eval.ts` expands every nested case
into a normalized record with:

- a globally unique case ID;
- dataset version, category, and risk;
- rendered multi-message input;
- resolved machine assertions;
- human or protocol rubric metadata; and
- optional stream/cancellation execution metadata.

The validator fails when:

- the dataset has fewer than 200 cases;
- a required category has fewer than 25 cases;
- an ID, family ID, assertion ID, or rubric criterion is duplicated;
- a family version differs from the dataset version;
- a message template or assertion references a missing variable;
- rubric weights do not total 1; or
- observed output, scores, winners, or results are added to an input fixture.

Run the validator regression:

```text
pnpm --filter @athyper/svc-ai eval:openai:validate
```

This asset contains no model outputs or scores. `evaluation_status` remains
`not_run` until an approved harness executes the exact immutable version and
records results in a separate, access-controlled artifact. Never write provider
responses, real tenant content, or customer identifiers into this fixture.

For any semantic change, create a new versioned fixture instead of editing the
input set attached to a completed evaluation. The operational gates and
evidence procedure are in
`docs/runbooks/atlas-agent-phase2-openai-evaluation.md`.

## Anthropic production baseline

`atlas-anthropic-baseline-v1.json` reuses this synthetic provider-comparison
input by exact SHA-256 while locking all three production Atlas public modes to
reviewed Anthropic models and `no-fallback-v1`. Validate it with:

```text
pnpm --filter @athyper/svc-ai eval:anthropic:validate
```

The approval template is deliberately pending. Live readiness and pilot
execution require the approved provider environment and restricted sign-off
artifact described in
`docs/runbooks/atlas-agent-phase2-anthropic-pilot.md`.
