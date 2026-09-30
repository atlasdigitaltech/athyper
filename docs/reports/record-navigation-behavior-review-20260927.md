# Record navigation behavior review

Reviewed the existing `record/record-navigation.tsx`, `record/record-body.tsx`,
`record/entity-record-page.tsx`, `entity-runtime-workspace.tsx` continuous-section
logic, `record-360-panel.tsx`, shared section-scroll hook, and relevant record/shell
CSS against Appendix A's SectionNavigation contract. This review concerns navigation,
not certification that every legacy business or collaboration feature is restored.

## Findings and corrections

| Behavior | Finding / disposition |
| --- | --- |
| Tab dropdown | Existing shared menu is reused, with authorized descriptor sections. No Country section labels are embedded in runtime code. |
| Menu styling | New placement did not inherit the old tab-container button background. Added an explicit transparent button reset and design-token spacing/focus styles to the shared record stylesheet. Popup aligns with the tab group rather than the detached arrow. |
| Explicit section jump | Old continuous workspace aligns within its content pane. New document-flow layout omitted breadcrumbs/navigation from scroll margins. Navigation is now sticky under the shell offset; measured band height feeds section and rail offsets. |
| Short final section | Replaced fixed 60vh trailing range with viewport-minus-reading-offset space so the last heading can land consistently. |
| Selection tracking | Explicit selection still pushes history and focuses the destination; passive scrolling replaces history without taking focus. Reading threshold now matches the measured navigation band plus token spacing. |
| Keyboard / dismissal | Shared section menu retains keyboard selection, Escape/focus restoration and outside-click dismissal. Tab arrow focus does not accidentally select sections. |
| Layout differences | Preserve Appendix A's one page-flow scroll surface. Do not copy legacy pane takeover/header-collapse mechanics into this composition without a separate supported layout contract. |
| Other parity | Provider-backed summaries, advanced collaboration and lazy remote-section providers remain separately scoped; this fix does not enable them or expand permissions. |

Verification: 14 browser fixture tests passed, including light/dark natural-height
sections with simulated 92px fixed shell chrome, each explicit section landing
16px below navigation, short-final-section behavior, passive selection/history,
mobile menu, shared navigation regression and collaboration preservation. Shared
form/detail typecheck passed. These are fixture checks, not a fresh authenticated
three-plane browser run. No signed metadata or backend authorization changed.
