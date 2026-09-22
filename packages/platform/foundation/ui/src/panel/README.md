# Panel components

Import `PanelHeader`, `PanelTabs`, and `PanelEmptyState` from `@athyper/platform-ui` and include the UI stylesheet.

- `PanelHeader`: icon, title, optional subtitle, title ID and action slot. Owners supply actions with accessible names and shared tooltips (bottom placement for side panels). Keep panel width, docking and visibility outside this component.
- `PanelTabs`: controlled `value` and `onValueChange`, labelled tablist, stable item IDs and panel IDs, optional counts. Supports arrow keys (including RTL), Home and End with automatic activation. Owners render labelled tab panels and retain their data/drafts.
- `PanelEmptyState`: icon, heading, description and action slot. It owns the bordered surface, minimum height, explicit typography and outlined action-button styling; consuming panels should only supply layout spacing. Owners decide when results are empty and which recovery action applies.

Quick access and Collaboration use these primitives. Do not repeat tab counts in empty-state headings; show a filtered result summary only when useful. Data loading, permissions, persistence and feature-specific actions remain with each feature.

For a modal drawer, use `Drawer.Header appearance="panel"` to reuse `PanelHeader` while preserving drawer labelling, close-button focus and modal isolation. `PanelEmptyState tone="error"` changes the icon tone without changing card geometry. Supply user-facing recovery guidance; do not display raw transport errors. `PanelTabs` items may supply `accessibleLabel` to distinguish unavailable counts from known zero counts.
