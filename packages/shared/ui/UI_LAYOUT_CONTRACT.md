# UI Layout Contract

**Package:** `@athyper/ui`  
**Applies to:** `apps/web/app/(shell)/`  
**Status:** Enforced — mechanical grep/replace only, no per-page judgement calls.

---

## Spacing Token Map

| Slot | Canonical Class | Disallowed Variants |
|---|---|---|
| CardContent body padding | `p-4` | `p-3`, `px-3 py-2.5`, `px-4 py-3`, `p-2` |
| Dialog form stack | `space-y-3` | `space-y-2`, `space-y-4` |
| Card grid gap | `gap-3` | `gap-2`, `gap-4` (in grid/card-list context) |
| Filter pill bar gap | `gap-1.5` | `gap-1`, `gap-2` (in filter context) |
| TabsContent top margin | `mt-4` | omitted |
| Skeleton — single row | `h-12` | `h-10`, `h-11`, `h-14` |
| Skeleton — two-line row | `h-16` | `h-14`, `h-18`, `h-20` |
| Skeleton — card preview | `h-24` | `h-20`, `h-28`, `h-32` |

---

## Skeleton Tier Guide

| Tier | Height | Content it represents |
|---|---|---|
| Row | `h-12` | Single-line list item (job type, lookup entry) |
| Row+subtitle | `h-16` | Two-line item (title + metadata) |
| Card preview | `h-24` | Card with title + metadata + badge |
| Card tall | `h-28` | Card with title + description + metadata |

Use the smallest tier that fits the real content shape. Never use `h-32` or above for skeleton placeholders.

---

## PageFrame Width Variants

| Prop | Tailwind Class | Max-Width | Use Case |
|---|---|---|---|
| `width="narrow"` | `max-w-content-sm` | 640px | Settings forms, simple detail pages |
| `width="default"` | `max-w-content-md` | 768px | Standard entity pages, list pages |
| `width="wide"` | `max-w-content-lg` | 1024px | Dashboards, multi-column layouts |
| `width="full"` | `max-w-content-full` | 1536px | Workbenches, GL, Period Close |
| _(omitted)_ | none | unconstrained | Full-bleed shell chrome |

When applying a width, remove any inner `max-w-*` wrapper div from the page — the constraint lives on `<PageFrame>`, not its children.

---

## RowCard Slot API

Stable as of Phase 1.4. Use `RowCard` from `@athyper/ui/data` for every compact list row.

| Slot | Prop | Notes |
|---|---|---|
| Left indicator | `leading` | Avatar, icon, sort-order number — rendered `shrink-0` before main body |
| Status/type chips | `badge` | One or more `<Badge>` elements (or any inline node) |
| Primary label | `title` | Wrapped in `text-sm font-medium`; pass `<span className="font-mono">` to override |
| Secondary info | `metadata` | Block div with `text-xs text-muted-foreground`; pass inline flex div or stacked `<p>` elements |
| Right controls | `actions` | Icon buttons and small controls — rendered `shrink-0 items-center gap-1` |
| Navigation | `href` | Wraps Card in `<a>`. Adds `cursor-pointer hover:border-primary/50` |
| Click handler | `onClick` | Same hover treatment as `href` |
| Card class | `className` | `opacity-60`, `border-destructive/30`, etc. applied to Card wrapper |
| Escape hatch | `children` | Bypasses all slots. `className` still applies. Use when topics-pill arrays, multi-section layouts, or deeply stateful row content don't fit the standard shape |

**Do not use `Card` + `CardContent` for list rows.** Migrate any inline `<Card><CardContent className="p-3">…` pattern to `RowCard`.  
Jobs pages (`dlq`, `schedules`, `history`) use the **ESCAPE** hatch — expandable `<pre>` panels and multi-line stacked content don't fit the slot model, but the Card shell is still expressed via `RowCard className={...}>{children}</RowCard>`.

---

## Notes

- `CardContent` padding is always `p-4`. The only exception is `RowCard` rows that deliberately use `p-3` for compact list-style layouts — document the exception with a comment.
- `space-y-3` in dialogs covers the form field stack inside `DialogContent`. The outer `DialogContent` padding is controlled by the primitive and not overridden.
- `gap-3` applies to `grid` card layouts. Flex toolbars and action rows use `gap-2` intentionally — do not change those.
- `gap-1.5` is enforced inside `FilterPillBar` (baked in). Pages that still use inline pill buttons keep their own gap; migrate to `FilterPillBar` to get canonical gap.
- `mt-4` on `TabsContent` is required on every `<TabsContent>` element that renders a content region, not a trigger.
