# Adversarial verification — Entity detail / form runtime

Verifier role: adversarial refutation attempt.
Target finding: "Contract test for the detail-composition import boundary fails today (broken gate)", claimed severity **high**.

## Verdict

**PARTIAL — defect reproduced exactly, severity overstated (high → medium).**

The mechanical facts of the finding are all correct and I reproduced them from the
current source. What does not survive scrutiny is the *consequence* framing: this is a
stale exact-list assertion, not an untrustworthy or non-functioning guard, and it is
not what makes any gate red.

## 1. Citation and quote: exact

- `tests/contracts/detail-navigation.test.ts:94-111` — the `assert.deepEqual(imports.sort(), [...])`
  whitelist is exactly at lines 94–111, and its 13 expected entries match the finding's
  quote verbatim and in order.
- `packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx:2-3` —
  `import { EntityRecordFields } from "./record-fields";` and
  `import { EntityRelatedSection } from "./related-entity-section";` are at those exact lines.
- `package.json:76` is exactly `"test:plane-contracts": "tsx --test tests/contracts/*.test.ts"`,
  reachable from `test:root` (`package.json:66`) and `test:repo` (`package.json:67`).
- Line numbers in the finding are correct; nothing in the quote is fabricated.

## 2. Reproduction (both the direct binary and the real script)

```
$ ./node_modules/.bin/tsx --test tests/contracts/detail-navigation.test.ts
✖ metadata detail composition has an explicit shared-only import boundary
  AssertionError: ...
  actual:   [ ... './record-fields', ... './related-entity-section', ... ]
  expected: [ ...without those two... ]
  at tests/contracts/detail-navigation.test.ts:94:10

$ pnpm test:plane-contracts   -> EXIT=1
ℹ tests 304  ℹ pass 279  ℹ fail 13
```

The test is red, and it is red **at HEAD**, not merely in the in-flight working tree:
both cited files are clean against HEAD (`git status --porcelain` → empty for both;
last commits `f21168897` / `080a0b092`). I also extracted a pristine `git archive HEAD`
copy to `/tmp` and ran the suite there: the same test appears in the HEAD failure list.
So this is a committed defect, not an artifact of uncommitted work.

## 3. Where the finding is overstated

**(a) The gate is not red because of this test.** In-tree, `pnpm test:plane-contracts`
has **13** independent failures (`Atlas home...`, `Neon operating-organization browser
contract`, `supplier controls reject invalid route IDs...`, `the publication workspace is
available to both separated actors`, etc.). In the pristine HEAD extraction it is **21**
failures. Fixing this one assertion does not turn the suite green.

**(b) `test:root` never even reaches it.** `package.json:66` chains
`pnpm test:reachability && pnpm test:plane-contracts && ...`. `test:reachability` itself
exits 1 today:

```
$ node tooling/scripts/testing/verify-test-reachability.mjs --check ; echo $?
Error: Test reachability verification failed:
- tooling/scripts/local-dev/candidate.test.mjs: root-owned tests must live under tests/contracts, ...
1
```

So the "standard gate" aborts one layer upstream; this suite only runs when invoked
directly. The phrase "permanently failing gate on the shared framework" overstates the
effect.

**(c) "the legitimate shared imports are indistinguishable from a future bespoke import"
is inaccurate.** The exact-list assertion is precisely the mechanism that would still flag
a future extra import as an unexpected entry — updating the list to include two legitimate
shared modules does not disable it. Moreover the *same test* carries a whitelist-independent
entity denylist at `tests/contracts/detail-navigation.test.ts:112`:

```ts
assert.doesNotMatch(source, /\b(country|currency|business_partner)\b/);
```

That check is inert **only** because line 94 throws first; the trivial fix (append the two
names) restores it immediately. I confirmed it would pass today:
`grep -Ei '\b(country|currency|business_partner)\b' detail-workspace.tsx` → no match.

**(d) The framework is actually rule-compliant — only the test is stale.** I verified the
two newly imported modules are genuinely entity-agnostic shared code:
`record-fields.tsx:3-4` takes `EntityDetailDescriptorV1`/`EntityRecordV1` + `fieldKeys`
(no entity names), and `related-entity-section.tsx:2-27` takes
`ownerEntityCode`/`ownerRecordId`/`relationship` and composes the shared
`@athyper/platform-entity-list-view` runtime. No entity-specific import or identifier
exists in `detail-workspace.tsx`. `tests/foundation/second-entity-reuse-currency.test.tsx`
is a different (PageWorkspace composition) guard and does not cover this boundary.
No other gate polices it: `tooling/scripts/policy/source-imports.mjs` is a generic
import extractor with no `form-detail`/`detail-workspace` rule, and there are no
`no-restricted-imports`/boundaries ESLint rules configured in this repo.

## 4. Corrected picture

- **Real defect**: yes — a stale exact-import whitelist at
  `tests/contracts/detail-navigation.test.ts:94-111` is out of date with
  `detail-workspace.tsx:2-3`, so the shared framework's one automated import-boundary
  guard for the metadata detail composition is currently red and its line-112 entity
  denylist never executes.
- **Severity**: medium, not high. Zero runtime, security, authorization or data impact
  (the finding concedes this; the shipped Country detail route and the shared composition
  are correct and correctly factored). It is a test-maintenance/golden-list defect that
  degrades an architecture-regression signal, in a gate that is already red for 12 other
  in-tree reasons and upstream of a `test:reachability` failure.
- **Proposed fix is sound** (append the two shared-only entries, or replace the exact
  list with a denylist) but its stated benefit is smaller than claimed: the exact list
  still discriminates future imports, and the entity denylist at line 112 is the durable
  part of the guard. The higher-value change is to move the line-112 denylist **before**
  the exact-list assertion so the entity-specificity signal is never masked by golden-list
  churn.

## Evidence index

| Claim element | File:line | Result |
| --- | --- | --- |
| Whitelist assertion + quote | `tests/contracts/detail-navigation.test.ts:94-111` | exact |
| New imports | `packages/platform/entity/runtime/form-detail/src/detail-workspace.tsx:2-3` | exact |
| Gate script | `package.json:76` | exact |
| Gate chain | `package.json:66-67` | `&&`-chained before plane-contracts |
| Entity denylist (inert) | `tests/contracts/detail-navigation.test.ts:112` | would pass today |
| Shared-only nature of imports | `record-fields.tsx:3-4`, `related-entity-section.tsx:2-27` | no entity specificity |
| Upstream gate already red | `tooling/scripts/testing/verify-test-reachability.mjs` (exit 1) | blocks `test:root` |
| Suite breadth of redness | `pnpm test:plane-contracts` | 13 fail in-tree / 21 fail at HEAD |
