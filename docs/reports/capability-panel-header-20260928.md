# Shared capability-driven panel header

All record tools (Comments, Files, Activity & History, Atlas) and global attention tools (Notifications, Inbox) use `PanelHeader` capabilities. The component renders New, History, Pin, Full view, Close in fixed order, omitting absent actions. Existing labels/icons and feature callbacks remain with their owners. Tooltips, accessible names, pressed/expanded state, disabled actions and links use the shared control renderer.

Comments registers its existing authorized create composer; Files registers its existing authorized upload entry; Activity registers manual capture only on Saved snapshots when the published capability permits it. Capturing disables the header action. Atlas exposes New conversation and History in the header. Feature action docks remain available as contextual shortcuts.

Record panels preserve their mounted content when changing pin or full-view mode. Pinned panels reserve workspace width; unpinned panels overlay it. Notifications/Inbox retain global scope and their dedicated destinations. Pin is unavailable on compact layouts, where record tools already use content view and attention tools use the mobile drawer. Full view and Close use existing destinations and focus handling.

`RecordPanelActionContext` lets feature bodies register actions without DOM queries or entity-specific wiring. Callback refs avoid re-registration loops and keep current record state. Shared Tooltip was extracted unchanged from the UI barrel to avoid a circular dependency from PanelHeader.

Validation: 75 browser scenarios passed across targeted runs: record collaboration (30), Activity (29), tooltip behavior (2), six-panel header layout (6), Notifications/Inbox (6), and actual Atlas side/full header actions (2). Covers permission-driven capture, keyboard activation, light/dark, compact layouts, RTL, draft preservation, comparison state and pin transitions. UI, shell and form-detail typechecks passed; `git diff --check` passed.

The initial legacy Node Atlas history run completed its dock assertion but stalled in its fullscreen case and was stopped; it is not counted as a passing suite. Actual Atlas side/full browser tests now validate the changed header instead.

DEV source consumes these shared frontend components directly; no Country metadata publication or permission change is required. Authenticated live tenant acceptance remains a manual refresh check.
