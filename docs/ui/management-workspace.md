# Shared management workspace

Business Partners and Studio Bank Directory use the same collection layout from `@athyper/platform-shell`:

- `ManagementWorkspace` composes the existing wide `PageFrame` and `EntityPageLayout`. Supply a `PageHeader`, navigation and module content. Record pages using `useRecordPage()` still replace collection chrome and restore it when they unmount.
- `ManagementNavigation` renders accessible section links, attention counts and optional overflow. Modules provide localized labels, links and a current key. Plain link behavior is preserved for modified clicks; optional `onNavigate` handles normal SPA navigation.
- `ManagementToolbar` aligns module-owned view, search and action controls. It owns spacing and wrapping, not permissions or query semantics. Named `data-slot="search"` and `data-slot="actions"` children can use its flexible slot rules.
- The existing entity-list runtime continues to own descriptor-driven saved views, filters, column controls, selection, bookmarks, pagination and authorization. Its application shell, navigation and query toolbar now consume the shared components. These features were not replaced with a second list engine.
- `StickyListTable`, exported from `@athyper/platform-entity-list-view`, provides the existing sticky table container. Consumers use the list stylesheet and semantic table markup, including mobile `data-label` cells.

## Example

```tsx
<ManagementWorkspace
  header={<PageHeader level="collection" title="Bank directory" actions={permittedActions} />}
  navigation={<ManagementNavigation label="Bank directory sections" items={sections} currentKey={activeKey} onNavigate={navigate} />}
>
  <ManagementToolbar>
    {viewSelector}
    <div data-slot="search">{search}</div>
    <div data-slot="actions">{permittedControls}</div>
  </ManagementToolbar>
  {moduleContent}
</ManagementWorkspace>
```

Import the shell stylesheet once in the application shell. When using entity list tables, also import `@athyper/platform-entity-list-view/styles.css`. Components, alignment and navigation styles belong to the shared packages; module-specific forms and business rules remain with their modules. Use theme spacing, colors, typography and control tokens.

## Bank Directory

Manage is the default section. Overview contains release and delivery diagnostics; Review & Approval contains immutable revisions and the existing independent-review/MFA workflow. Section links retain their query state through reload and browser Back/Forward. Authors open import from the header; successful validation opens Review & Approval.

The list response includes the active Studio directory snapshot, never an unapproved draft or an approved release still awaiting activation. The list supports built-in all/active/retired views, name/country/BIC search, country filtering, sorting, column visibility, density and 20-row pagination. Bank details show routing identifiers and branches without exposing an edit path. These controls operate on the received snapshot; global-scale directory browsing should use a paged query contract before introducing a large licensed dataset. Named saved views and bulk mutation are not enabled for this module.

An always-visible compact synchronization summary reflects the existing reconciliation response. Technical hashes and delivery receipts remain in Overview. Directory permissions, server-side authorization, immutable publication and company/account ownership boundaries are unchanged.

## Verification

Shared list navigation/context regression tests, collection-to-record header ownership, bank filtering/details/authorization component tests, publication tests, type checks and production builds cover the adoption. Browser fixture checks cover desktop and mobile presentation and section navigation; they are not an authenticated publication test.

DEV deployment on 2026-09-09: API, worker, scheduler, Studio web and NEON web are healthy on `management-workspace-20260909` images. The deployed directory service returned active release 1, three published banks and one revision using its restricted database role. Validation passed: 18 list/context tests, four record-header tests, 17 module component tests and 104 publication tests. All relevant type checks and production builds passed. Saved browser sessions had expired, so authenticated page verification stopped at sign-in; desktop/mobile component fixture checks and live service verification were completed separately. QA was unchanged. Private rollout/rollback configurations and evidence are in the DEV `management-workspace-20260909` receipt directory.
