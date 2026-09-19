# Codex handoff

## Objective

Continue the application-experience and shared-shell work in the `athyper`
monorepo. The most recent completed slice consolidates application startup,
surface coordination, and the page workspace across the Neon, Mesh, and Studio
planes.

## Completed work

- All work is committed and the working tree was clean when this handoff was
  created.
- Current branch: `stack-v2-foundation`.
- Current commit: `ec5addbed6381a5e4691c26653c7e0cfa6e0a3d7`
  (`feat(shell): consolidate startup, surface coordination and page workspace`).
- The latest slice updated shared shell composition, overlay/surface state,
  application fallback handling, activity counts, navigation, and page-workspace
  behaviour. It also integrated the result into the Neon, Mesh, and Studio app
  providers and added related contract, foundation, and browser coverage.

## Pending work

- Review `docs/architecture/application-experience/build-work-plan.md` and
  select the next planned application-experience slice.
- Keep any follow-up changes scoped to the selected slice; do not begin broad
  refactors without first recording the intended boundary and verification.
- Run the smallest relevant verification command for the files changed. For
  shared-shell changes, start with `pnpm test:shared-shell-phase8` or the
  targeted contract/foundation/browser test named in the affected area.

## Constraints

- This is a pnpm 10.33.0 monorepo targeting Node.js 24.19.0.
- The three product planes are `apps/neon`, `apps/mesh`, and `apps/studio`.
  Shared shell code lives in `packages/platform/shell/`.
- Preserve the cross-plane shared-shell contract. Plane-specific behaviour
  belongs in the appropriate app/provider boundary.
- Before changing accounts or sessions, commit work and update this handoff
  with the new commit, pending work, and validation performed.

## Relevant files

- `docs/architecture/application-experience/build-work-plan.md` — planned work
  and rollout context.
- `packages/platform/shell/shell/src/client.tsx` — main shared shell client.
- `packages/platform/shell/shell/src/page-workspace.tsx` — page-workspace
  behaviour added in the latest slice.
- `packages/platform/shell/shell/src/shell-surfaces.ts` and
  `packages/platform/shell/shell/src/shell-overlay-state.ts` — surface and
  overlay coordination.
- `packages/platform/shell/app-foundation/src/application-fallbacks.tsx` —
  application fallback handling.
- `tests/contracts/shared-shell-navigation.test.ts` and
  `tests/foundation-browser/shared-shell.spec.ts` — primary shared-shell
  regression coverage.

## Validation status

No tests were run while preparing this documentation-only handoff. Check the
commit history or CI for validation associated with the latest implementation
commit, then run focused verification for any new changes.
