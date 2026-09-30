# Studio application URL review

Authenticated follow-up is now available in [STUDIO_AUTHENTICATED_REVIEW.md](./STUDIO_AUTHENTICATED_REVIEW.md). The anonymous-session limitation below describes the initial review.

Reviewed 2026-09-07 against the local working tree and `https://studio.dev.athyper.test`. Fixes are local; the running development deployment was not replaced.

## Confirmed findings and fixes

| Priority | Affected URLs | Finding and fix |
| --- | --- | --- |
| P1 | `/notification-sw.js`, notification links | A URL such as `/\\external.test/path` bypassed the push check. Click handling changed the pathname while retaining the external origin. Resolve against the application origin and replace the entire URL on mismatch or parse failure. JSON `null` push payloads now receive the default notification. Shared worker fix also applies to Neon and Mesh. |
| P1 | `/entity/experiences` | Editing discarded the saved draft and its `expectedContentHash`, permitting stale drafts to overwrite another administrator's changes. Keep the saved revision separately from dirty state, retain the hash when history arrives after editing, and prevent saves until history loads successfully. Publishing requires a saved, clean draft. |
| P2 | `/entity/experiences` | Restore did not enter the busy state, and controls remained editable during mutations, allowing responses to overwrite intervening edits. Lock controls during save/generate/publish/restore, update publication history, and reset Atlas retry keys when the instruction or adopted source changes. |
| P2 | `/mdg/business-partner/ai-experience` | Editing and publication were possible while the draft was loading; a failed read was treated as an absent draft. Disable editing during loading/mutations and require retry after a read failure. A successful empty response still permits baseline authoring. |
| P2 | `/sign-in?reason=a&reason=b` | Repeated query parameters become arrays in Next.js and caused `normalizeReason().trim()` to throw. Normalize sign-in inputs to their first value before passing them to the identity gate. Reproduced a server render error on the development host. |
| P2 | `POST /api/auth/backchannel-logout`, `POST /api/auth/logout` | JSON `null` and malformed JSON produced HTTP 500. Validate object bodies and logout-token types; return HTTP 400 without clearing cookies. Reproduced both 500 responses on the development host. Shared auth fix also applies to Neon and Mesh. |
| P2 | Development assets for all pages | The supplied `studio.dev.athyper.test` hostname was absent from Next.js `allowedDevOrigins`. Add the exact host while retaining existing development aliases. This affects development-server asset access, not production route resolution. |

## Review scope and verification

- Inspected every listed page/route adapter, catalog mapping, shell bootstrap, auth/relay wiring, shared auth handlers, relay security checks, notification worker, and Studio editor request paths.
- Verified all catalog workspace/module keys have registered default surfaces; unknown slugs retain `notFound()` handling. Several MDG pages are informational by design; this review does not turn them into new administration applications.
- Studio production build and typecheck pass.
- Auth, deep-link, catalog, composition, trusted-device and session-race suite: **78 passed, 12 skipped**. The skipped tests require Redis integration configuration.
- New Studio editor component tests: **5 passed**. Studio Business Partner package: **12 passed**.
- Relay behavioral tests: **31 passed**, excluding three pre-existing source-pattern assertions that fail on the already-modified `apps/neon/lib/relay.ts` operation array. The initial unfiltered combined suite had **89 passed, 3 failed**; this is not a clean repository-wide test run.
- `pnpm test:reachability` reports a stale generated retirement/test inventory. The new tests are under the existing root runner globs. The unrelated inventory was not regenerated across the repository's many pre-existing changes.
- Whitespace checks pass for this review's changed source files. Repository-wide whitespace checks report existing URL-catalogue whitespace outside these changes.

## Live coverage and limits

The saved Studio browser state is anonymous/expired. A real Chromium navigation from `/home` reaches the Studio identity-provider sign-in. Therefore successful login, tenant selection, elevated MFA, authorized business mutations, and signed provider logout were not exercised live. Controlled contract/component tests cover those reviewed mechanisms where available.

**67 GET URLs** were probed without session cookies. **58** page responses contain streamed authentication redirects, so their HTTP 200 status is not evidence of authenticated page rendering. No numeric server-render error digest was found on the ordinary page URLs. The deliberately malformed sign-in URL did reproduce a render error before the fix.

Anonymous requests to representative relay operations for GET, POST, PUT, PATCH and DELETE returned **401**; an unknown operation returned **404**. Anonymous refresh, context selection, step-up, MFA verification and touch returned **401**. The malformed logout requests returned **500** on the unchanged deployment and **400** in the patched handler tests. Callback recovery URLs remain on the Studio origin.

| GET path | HTTP status | Observed response |
| --- | --- | --- |
| `/` | 200 | Streamed authentication redirect |
| `/api/auth/callback` | 303 | Recovery redirect |
| `/api/auth/contexts` | 401 | Authentication required |
| `/api/auth/logout/callback` | 303 | Recovery redirect |
| `/api/auth/session` | 200 | Public page / endpoint |
| `/atlas` | 200 | Streamed authentication redirect |
| `/atlas-ai` | 200 | Streamed authentication redirect |
| `/atlas-ai/agents` | 200 | Streamed authentication redirect |
| `/atlas-ai/governance` | 200 | Streamed authentication redirect |
| `/atlas-ai/knowledge` | 200 | Streamed authentication redirect |
| `/atlas-ai/providers` | 200 | Streamed authentication redirect |
| `/communications` | 200 | Streamed authentication redirect |
| `/communications/activity` | 200 | Streamed authentication redirect |
| `/communications/notifications` | 200 | Streamed authentication redirect |
| `/entity` | 200 | Streamed authentication redirect |
| `/entity/content` | 200 | Streamed authentication redirect |
| `/entity/documents` | 200 | Streamed authentication redirect |
| `/entity/experiences` | 200 | Streamed authentication redirect |
| `/entity/metadata` | 200 | Streamed authentication redirect |
| `/entity/policies` | 200 | Streamed authentication redirect |
| `/entity/publishing` | 200 | Streamed authentication redirect |
| `/entity/workflows` | 200 | Streamed authentication redirect |
| `/extensions` | 200 | Streamed authentication redirect |
| `/extensions/developer-tools` | 200 | Streamed authentication redirect |
| `/extensions/plugins` | 200 | Streamed authentication redirect |
| `/foundation` | 200 | Streamed authentication redirect |
| `/foundation/foundation` | 200 | Streamed authentication redirect |
| `/foundation/reference-data` | 200 | Streamed authentication redirect |
| `/home` | 200 | Streamed authentication redirect |
| `/inbox` | 200 | Streamed authentication redirect |
| `/integration` | 200 | Streamed authentication redirect |
| `/integration/automation` | 200 | Streamed authentication redirect |
| `/integration/integration-hub` | 200 | Streamed authentication redirect |
| `/livez` | 200 | Public page / endpoint |
| `/logout` | 200 | Public page / endpoint |
| `/mdg` | 200 | Streamed authentication redirect |
| `/mdg/business-partner` | 200 | Streamed authentication redirect |
| `/mdg/business-partner/ai-experience` | 200 | Streamed authentication redirect |
| `/mdg/business-partner/matching` | 200 | Streamed authentication redirect |
| `/mdg/business-partner/model` | 200 | Streamed authentication redirect |
| `/mdg/business-partner/operations` | 200 | Streamed authentication redirect |
| `/mdg/business-partner/publication` | 200 | Streamed authentication redirect |
| `/mdg/business-partner/validation` | 200 | Streamed authentication redirect |
| `/mdg/business-partner/workflows` | 200 | Streamed authentication redirect |
| `/notification-sw.js` | 200 | Public page / endpoint |
| `/notifications` | 200 | Streamed authentication redirect |
| `/observability` | 200 | Streamed authentication redirect |
| `/observability/errors` | 200 | Streamed authentication redirect |
| `/observability/platform-observability` | 200 | Streamed authentication redirect |
| `/observability/reliability` | 200 | Streamed authentication redirect |
| `/plans` | 200 | Streamed authentication redirect |
| `/plans/entitlements` | 200 | Streamed authentication redirect |
| `/plans/platform-catalog` | 200 | Streamed authentication redirect |
| `/plans/subscriptions` | 200 | Streamed authentication redirect |
| `/plans/usage` | 200 | Streamed authentication redirect |
| `/platform-operations` | 200 | Streamed authentication redirect |
| `/platform-operations/analytics` | 200 | Streamed authentication redirect |
| `/platform-operations/operations` | 200 | Streamed authentication redirect |
| `/platform-operations/search` | 200 | Streamed authentication redirect |
| `/platform-operations/security` | 200 | Streamed authentication redirect |
| `/readyz` | 200 | Public page / endpoint |
| `/select-context` | 200 | Streamed authentication redirect |
| `/sign-in` | 200 | Public page / endpoint |
| `/trust-iam` | 200 | Streamed authentication redirect |
| `/trust-iam/governance-audit` | 200 | Streamed authentication redirect |
| `/trust-iam/identity-access` | 200 | Streamed authentication redirect |
| `/trust-iam/onboarding` | 200 | Streamed authentication redirect |

## Regression commands

```sh
pnpm --filter @athyper/studio build
pnpm --filter @athyper/studio typecheck
pnpm exec tsx --test tests/contracts/studio-url-review.test.ts tests/contracts/auth-deep-link.test.ts tests/contracts/auth-session-foundation.test.ts
pnpm exec tsx --tsconfig tooling/config/tsconfig-react.json --test tests/foundation/studio-experience-editor.test.tsx
pnpm --filter @athyper/product-studio-business-partner test
```
