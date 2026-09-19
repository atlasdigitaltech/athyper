# Business Partner shared action UI

Status: local UI integration implemented, deployment qualification outstanding.
No grant changes, target-enforcement selection, publication or deployment performed.

## Implemented behavior

`EntityRecordAction` is the shared renderer used by record headers, related records,
and BP role/company setup actions. Actions carry an explicit operation key and an
optional safe version-1 decision. A decision whose operation does not match the
binding, or whose version/state/reason is invalid, cannot enable navigation.

| Server state | UI behavior |
| --- | --- |
| Allowed | Use the server-bound local destination |
| Context required | Open transaction context selection; apply coordinates and reload the summary before another action |
| Verification required | Start the normal CSRF-protected BFF MFA flow and return to the record |
| Preflight required / workflow blocked | Open requests to inspect prerequisites; do not execute the blocked action |
| Denied / not applicable | Disabled action with a safe explanation |
| Unavailable | Retry summary decisions, showing the safe diagnostic reference when valid |

Absent remediation handlers remain disabled. Historical records hide actions.
No client state or decision reference is an execution token: destinations and
commands still authorize current access. Server responses supersede local readiness.

Header and section actions now use the same operation binding and server-bound URL.
Changing a local role tab no longer rewrites the operation target. The destination
must collect any role choice not supplied by the server binding.

The header identifies Partner-wide master data separately from transaction context.
Transaction context selection is available from the record and uses authorized
organization/company choices. An organization-only requirement can be applied
without selecting a company. Unsupported coordinate types remain closed.
Overview company/date filters remain local to their summary and are explicitly
labelled as filters; they do not authorize actions or change transaction context.

## Compatibility and outstanding gates

The current BP server still emits only legacy-authorized actions. Those bindings
now carry explicit `allowed` readiness and the current legacy IAM profile revision.
This work does not infer discoverability from denied permissions, promote shadow
results to permissions, or claim that production emits every target decision state.
Older bindings without a decision retain their existing href/disabled behavior.

Before claiming the full shared-UI completion criterion:

1. Connect selected-release target readiness to the summary's canonical operation
   bindings, retaining reviewed discoverability and safe prerequisite semantics.
2. Qualify all states through authenticated UI/API journeys on the compatible
   deployed metadata/runtime release, including revocation and changed context.
3. Provide precise prerequisite destinations where the owning workflow requires
   something more specific than the existing requests workspace.
4. Review discoverability differences and named roles before any access activation.

Local tests exercise all eight decision states, mismatched bindings, invalid
state/reason pairs, unavailable diagnostics, unsafe destinations, missing handlers,
historical suppression, unchanged shell-free record admission and section behavior.
These are regression tests, not deployment evidence.
