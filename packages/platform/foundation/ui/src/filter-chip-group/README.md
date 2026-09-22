# FilterChipGroup

Import from `@athyper/platform-ui` with its stylesheet. Use for single-choice secondary filters (Records/Pages, All/Unread, or folders). Use `PanelTabs` for primary sections instead.

Supply a group label, items, controlled value and `onValueChange`. Counts are optional; omit unknown counts. Zero remains a known count. Each native button exposes `aria-pressed`; Tab reaches filters and optional management actions, while arrow keys, Home and End select and focus filters (including RTL support).

An item's optional `action` renders beside its filter button. Supply a separate accessible label and keep menus independent from selection. Owners retain data, filtering, permissions and menu behavior. Do not repeat a selected folder in a separate removable filter chip; provide an All files option to clear the selection.
