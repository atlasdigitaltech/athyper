# Manual UI walkthrough — isolated NEON

The user approved a simple read-only walkthrough of existing test partners today. Both dedicated Chrome windows are open with normal saved sessions: catl.admin and catl.owner. They use the existing loopback proxy 13320 to route neon.dev.athyper.test to the isolated UI. Opening the same URL in an ordinary browser outside these contexts may reach shared DEV instead.

No build, deployment, rollout or feature change was made. The accepted backend 6f108211… and UI 0336cce9… remain pinned. Seven NEW read-only groups/memberships/assignments provide 39 permission paths until midnight MYT, 12 September 2026 (16:00Z). All prior qualification groups remain revoked. The user can end the walkthrough sooner; no renewal is scheduled. Existing tenant/company read scopes are reused, so this is not a claim of IAM restriction to a single synthetic record.

Start with the existing partner 01a092d1-8242-7948-9ce9-6f19c38c4b27, organization a478f9c0-8226-5d22-9599-b8fb27a45180 and company 793b6cb3-3c61-57c0-9562-2cbc288bd4cf. Admin can read the existing ordinary requests; owner remains the independent-child negative control. Both see masked bank/tax values. No create, submit, approval, application, export or protected reveal permission was added.

Keep the user flow simple: browse navigation, context selection, sections, masking and counts; collect issues for one later fix batch. Features and rollout remain paused. No MFA elevation is required by these read-only permission assignments; normal session authentication still applies.

Operational records: `business-partner-manual-ui-walkthrough-20260912.proposal.dev.json` and matching user approval under governance/policy/reviews; access application and UI readiness reports under governance/policy/reports. The isolated server enforces effective_until independently. `watch-manual-ui-access.mjs` revokes at cutoff and refreshes only normal public IAM keys when needed; it never renews permissions or elevates sessions.

When the user says finished, run `node tooling/scripts/verification/isolated-enter/end-manual-ui-access.mjs`. This revokes only this walkthrough's memberships/assignments and retains history. The watcher exits when it detects revocation. Do not close user Chrome windows unexpectedly or delete saved sessions.
