# Shared contextual panels

The record tools (Comments, Files, Activity & History and Atlas) and tenant-wide attention tools (Notifications and Inbox) now use the same panel header and scope-row primitives. No entity-specific component or metadata enrollment was added.

## Component ownership

`PanelHeader`, `PanelContextRow`, `PanelTabs`, `PanelToolbar` and `PanelFooter` live in `packages/platform/foundation/ui/src/panel`. Theme-token styles provide matching icon sizes, header spacing, action placement, context rows and docks in light and dark themes. Layout adapts to content and translated labels; blank navigation or footer rows are not reserved.

The feature owners retain authentication, record admission, request cancellation, drafts, navigation and data loading. `PanelScope` distinguishes record scope from global scope but is not an authorization mechanism. Record titles come from the published detail presentation and current record header. Global attention panels do not consume the open record as their scope.

## Integrated behavior

- Comments and Files use the same compact header and record anchor as Activity. On the record page, navigation remains in the external record controls rather than a repeated Comments/Files/Activity strip inside the drawer.
- Comment creation uses the shared action dock and retains the existing draft/composer placement mechanism.
- Files retain search, file-level version history and authorized actions. Side-view file addition uses the bottom dock. Discovery controls and the dock remain stationary while results scroll.
- Activity uses the shared segmented tabs, collapsed advanced filters, fixed toolbar and one content scroll area. Snapshot capture appears in the bottom dock; selection introduces comparison actions. Timeline and Audit log have no empty footer.
- The snapshot-capture attribution explanation is retained under Inspect instead of repeating it in every Timeline entry. Capture IDs remain the fallback where the API supplies no authorized actor label.
- Atlas uses the shared scope row. New conversation, history and pin controls live below the header; expand and close retain the common placement. The existing composer uses a bounded dock. No unsupported Ask/Context/Threads API or automatic inclusion of comments/files was introduced.
- Notifications and Inbox retain their existing workflows and filters with explicit global scope labels. Their header and context geometry match the record panels.

## Verification and limits

The acceptance suite covers shared header geometry at 360/768/1440 widths in light/dark themes; real Notifications/Inbox navigation at 390/768/1440; localized Country, Arabic/RTL, side/full reading offsets, comment drafts, snapshot selections, comparison, authorization denial and identity changes. Typechecks cover UI, shell and record detail.

The repository-wide strict CSS ratchet still reports prior findings in record, form-detail, UI and shell stylesheets. The new shared-anatomy and drawer-layout CSS blocks have no token-audit findings; no ratchet baseline was raised.

The legacy Node attention test file has stale assertions about the Enable alerts control and Quick access count text. Its direct tsx run also requires a React preload for an existing icon JSX issue. Browser acceptance exercises the actual attention drawer instead. These legacy tests are not claimed as passing.

No metadata republication, permission changes, saved-snapshot rewrites or business-record writes are required. DEV source web services consume these shared UI changes. Authenticated live-user acceptance remains separate from the fixture-backed browser suite.

Final verification: all 69 browser scenarios were exercised successfully across the combined run and targeted reruns after fixes (including the new populated Files scrolling case). UI/shell/form-detail typechecks and `git diff --check` passed. The state fix prevents a compact-screen resize while Atlas owns the slot from changing the hidden record panel's preferred mode. Files and Activity now participate in the existing reading-offset preservation mechanism through their actual scroll containers.
