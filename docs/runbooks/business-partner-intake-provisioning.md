# Business Partner intake provisioning

`foundation-runner.ts` loads the selected plane's SQL DDL manifest. It does not author or activate the full-profile intake graph. `provision-development-business-partner-fixtures.ts` is an executable fixture CLI, and the clean three-plane certification script calls it explicitly. Fixture rows and published intake configuration are separate setup steps.

The ordered graph-authoring entry is `provisionBusinessPartnerIntakeGraph` in `server/db/scripts/provisioning/business-partner-intake-graph.ts`:

1. When a legacy request form is supplied, author the intake flow and native data surfaces, including organization identity.
2. Add the full-profile fields and request capture.
3. Apply collection presentation, address capture and bank editor configuration through the request-capture pipeline.
4. Restore standard address requirements and apply the full-profile collection's conditional requiredness rules.

Tiny bank copy adjustments now live with the bank editor; profile presentation lives with collection presentation; region and advanced address capture share the address editor. All exported Business Partner transforms reject another entity's graph before mutation.

`tooling/scripts/verification/activate-business-partner-full-profile.mts` uses this entry for an existing native intake graph. It retains its development Studio session and change-set prerequisites and verifies the authored graph before activation. Its configured change set must already exist; running the foundation or fixture provisioner alone does not satisfy this prerequisite. No automatic activation has been added to the DDL runner.

Reapplying the graph pipeline repairs the earlier unconditional address optionality even when the full-profile version marker is already present. Publish or activate the resulting metadata through the normal Studio process for deployed forms to receive this correction. Application code changes alone do not rewrite existing published graphs.

Focused verification:

```sh
pnpm exec tsx --test tests/foundation/business-partner-audit.test.ts tests/foundation/business-partner-full-profile.test.ts tests/foundation/advanced-address.test.ts tests/foundation/address-region.test.ts tests/foundation/collection-presentation.test.ts tests/foundation/entity-list-audit.test.tsx
pnpm --filter @athyper/product-neon-business-partner exec vitest run src/request-retry.test.tsx src/intake-submit.test.ts
```

## Reactivate only the address repair

With a valid elevated CATL Studio author session, run:

```sh
STUDIO_AUTH_STATE=tests/e2e/.auth/studio.json pnpm exec tsx tooling/scripts/verification/activate-business-partner-full-profile.mts --address-repair
```

This mode preserves the existing graph and applies only address requiredness. It uses the current revision as an optimistic concurrency check, verifies graph readback and active preview status, and writes `governance/policy/reports/business-partner-address-repair-activation.dev.json`.

On 2026-09-14, the active CATL development preview advanced from revision 57 to 58. The signed Neon runtime artifact was verified at revision 58: empty address line 1 and city fail in standard mode and are optional in full mode. The original graph is retained locally at `~/.athyper/qualification/address-requiredness/before-revision-57.json`. After the Neon session was refreshed, live read-only browser verification passed: the runtime descriptor contains the repaired rules, and native browser validation requires both empty fields in standard mode, permits them in full mode, and requires them again after switching back. No page errors occurred and no business records were created or updated. This is development-preview activation; historical published releases are preserved.

Repeat the live form check with a current Neon session:

```sh
pnpm exec tsx tooling/scripts/verification/probe-business-partner-address-repair.mts
```
