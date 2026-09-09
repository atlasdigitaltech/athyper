# Atlas automatic briefs — BP-AI-08 first slice

Status: implemented behind a default-off shell rollout option. BP-AI-08's release exit gate remains open. This slice does not enable a deployment.

## Rollout and use

A qualified NEON caller can pass `atlasProactiveBriefsEnabled={true}` to `PlatformShell`. Mesh and Studio remain excluded by the shell. The flag exposes a session-local **Automatic briefs while Atlas is open** checkbox and **Refresh brief** control for Business Partner context. The checkbox starts unchecked; it resets when the shell identity changes or the rollout flag is removed. Existing Atlas admission, tool authorization and confirmation controls still apply on the server.

Automatic generation requires an open Atlas workspace, user opt-in, resolved experience configuration and an eligible context. Record context must have a saved revision and must not be historical. Manage context uses the published analysis target and applied query coordinates. No draft values are sent. The scheduler waits 300 ms for context changes to settle and does not interrupt an active user question.

Section and dirty-state changes update context without scheduling inference. Saved revision, role/company scope and applied Manage query/selection changes can schedule a new assessment. Refresh starts a fresh conversation to avoid inheriting stale assessment prose or spending the local context budget on a previous brief. Reopening a completed brief in the same mounted shell does not regenerate it solely because the workspace mounted again.

## Cancellation and deduplication

The shared controller admits one concurrent request for an identical question/context/agent/attachment combination. Duplicate calls are suppressed before thread creation. This is controller-local deduplication, not distributed idempotency across tabs or server replicas.

Navigation aborts the old request. Both progress and completion check the captured context generation even when a transport ignores abort. Closing the last workspace aborts an automatic request and marks its pending response cancelled; reopening can retry. StrictMode mount replay does not cancel an immediately remounted workspace. An older request settling cannot clear the newer request's cancellation ownership. Disabling opt-in or removing the rollout flag cancels an active automatic request. User-triggered requests retain the existing Stop behavior.

## Context budgeting

Automatic requests use the existing server prompt fitter and the current provider configuration. System policy, scope instructions, tool definitions, bounded history, evidence and output count toward the local context limit. The existing constrained final-answer path removes additional tool advertising when necessary, preserving current evidence and policy. This slice introduces no model/window change and no client-side answer cache.

## Verification and remaining gate

Focused React tests cover default-off rollout, user opt-in, StrictMode, saved-state refresh, section/draft suppression, concurrent duplicate requests, late completion, navigation and last-workspace cancellation. Existing answer/history interaction tests and `pnpm qualify:business-partner-r9` remain regression checks. Local prompt-budget tests exercise the 4,096-token bound with intact evidence.

Still required before completing BP-AI-08:

- Bounded Redis evidence cache with complete owner revision/rule/descriptor coordinates, live disclosure reauthorization, TTL/size/count admission and invalidation. The existing reuse policy is a prerequisite, not an enabled cache. A parent record revision alone cannot invalidate related readiness evidence.
- Distributed request coordination and overload behavior, including retry after cancellation and process failure.
- Redis dataset/RSS/persistence measurements and session-continuity qualification before allocating AI cache capacity on the shared session service.
- Authenticated browser and pinned live-model measurements at an agreed dataset size: evidence p95 <2 s, first useful text p95 <5 s and ordinary brief completion <15 s. These remain proposed targets; unit-test durations do not establish acceptance.
- Target-deployment rollback and revocation evidence before enabling the shell option for a pilot.

Rollback the shell option to hide proactive controls and cancel automatic work. Basic user-triggered assistance remains governed by the existing Atlas controls.
