# Studio composition workspace — UI/UX refinement plan

Status: proposed implementation plan; no runtime configuration changes authorized by this document.

This supplements the [entity-designer implementation plan](studio-entity-designer-implementation-plan.md). It refines the existing workspace and review experience using the supplied tree/properties and split-preview prototypes. Existing edit qualification, concurrency, permissions, approval and publication controls remain authoritative.

## 1. Design direction

Use a compact tree-and-properties workspace and a dedicated Preview & changes mode within the same workspace. Both share source context, selection and the working copy. Avoid placing another large duplicate editor below the composition panel.

Reuse Neon Business Partner typography, form controls, search styling, icons, spacing and theme tokens. Richness comes from clear hierarchy, accurate status, responsive behavior and direct navigation between changes and fields. Avoid decorative gradients, additional nested cards and duplicated titles.

```text
Composition workspace                     [Approved · Read-only]
Change set · revision 63                   [Version details]
Runtime source: Development preview / Published release / Unknown

[Compose] [Preview & changes · 3]            [Undo] [Save draft]

Compose
[Search objects…                      /] [Filters] [Expand all]
Object tree                  Breadcrumb › selected object
                             [Properties] [Rules] [References]
                             Supported controls
                             [Technical details ▸]

Preview & changes
Compare: [Saved draft → Working copy ▾]   Surface: [Partner intake ▾]
[Split] [Unified]   [Desktop] [Mobile]   [Changed only] [Highlights]
Base / saved rendering                  Working / selected rendering
Changes (3)                             Findings and validation evidence
```

## 2. Accurate source and comparison context

- Separate editing state (draft, in review, approved, published) from runtime source (development preview, published release, unavailable/unknown).
- Identify both sides of a comparison by source type, identifier and revision/hash where supplied. Expand technical identifiers under Version details.
- Support saved-versus-working for unsaved changes, and explicit base-versus-selected saved configuration for review.
- If no persisted fork baseline exists, label a manually selected comparison source as a comparison source, not the draft's parent. Never label the initially loaded draft as a published baseline.
- The prototype's “Published · rev 63” and “draft 64 forked from revision 63” are illustrative. Revision 63 was approved in the observed journey; display lifecycle and ancestry only from evidence.
- Keep the comparison base fixed until explicitly changed. Mark outdated evidence when graph, source or target changes. Do not silently move the base after saving.
- A development-preview result is not target activation proof. Show observed source and timestamp where available; otherwise show unavailable, without fabricated activation status.

## 3. Composition workspace

### Header and layout

- One title, compact source summary and status badge. Remove repeated object titles and oversized source blocks.
- Desktop: adjustable two-column object navigator and properties panel; bound widths so form controls remain usable.
- Small screens: Objects / Properties navigation with a clear return action. Preserve selection and search state.
- One consistent action bar for Undo, Preview & changes and Save draft; hide unsupported mutations in read-only contexts. Keep publication in its existing journey.

### Search and tree

- Reuse the Neon search appearance, clear button, focus treatment and search icon. `/` focuses search only when the user is not typing in an editable control or modal.
- Match labels, keys, object types and category names case-insensitively. Highlight matches as escaped text.
- Preserve matching ancestors, temporarily expand matching paths, and restore user expansion after search is cleared. A category-name match exposes that category's contents.
- Filters: object type, changed, issues and editable. Define combination behavior as intersection, with an explicit Clear filters action.
- Count direct matching objects separately from contextual ancestors. Show no-results guidance.
- Preserve selected object when filtered out; show a “Selected object is outside these results” notice and Reveal selection action that explicitly clears conflicting filters.
- Categories have counts, collapsible groups, subdued empty states, type icons, selected-row styling and text-supported issue/change indicators.
- Implement accessible tree keyboard behavior: arrows, Home/End, expand/collapse and activation. Focus and selection must remain distinguishable.

### Properties

- Use Properties, Rules and References tabs with consistent read-only and editable layouts.
- Distinguish a shared field definition from a field placement. Show which surface/section owns a placement.
- Technical details contain IDs, keys, raw JSON and unsupported properties.
- Capability checks determine editable controls. Full-width-only intake controls retain span 12; the prototype's span 6 is not permission to broaden the renderer.
- Local input buffering must participate in dirty-navigation protection or be committed explicitly before switching objects. Never lose typed-but-unapplied values silently.

## 4. Preview experience

### Rendering and modes

- Render both sides with the actual supported compiler and Neon renderer. No imitation form used as runtime evidence.
- Split mode: aligned base and candidate canvases with source labels. Keep identical viewport sizes and input scenarios for meaningful comparison.
- Unified mode: candidate rendering with change markers; selecting a marker opens an accessible before/after property card. Show removed objects in the change list with a link to the base preview.
- Desktop / Mobile changes the preview viewport, not the data or source. Display the viewport width; provide a full-width preview mode when two desktop canvases do not fit. Do not squash desktop layouts into narrow panels and call that desktop parity.
- On narrow devices default to a Base / Candidate switch. Preserve the selected change while switching.
- Preview values are temporary and resettable. Share values across sides by stable field identity where compatible; explain fields that cannot carry values across schemas.
- Preview buttons cannot submit, approve, upload, publish or mutate business records. External lookups require a qualified read-only adapter; otherwise show an explicit limitation.
- Unsupported surfaces show an explanatory coverage state. A failed or unavailable preview is never displayed as an empty successful form.

### Direct interaction

- Selecting a change focuses its object in the tree and highlights the associated rendered control where stable renderer hooks exist.
- Provide “Inspect field” as an explicit mode, with equivalent keyboard actions; normal preview typing must not unexpectedly change editor selection.
- Previous/Next change supports a guided review. Preserve selected surface and scroll location when returning to Compose.
- Synchronized scrolling is optional enhancement work: enable only with reliable corresponding anchors and retain independent scrolling as fallback.
- Highlights combine a subtle border/background, icon and text; do not rely on red/green alone. Toggle highlights without changing the graph.

## 5. Human-readable differences

- Summary: changed objects, property edits, additions, removals and moves. Label counts clearly so multiple property edits on one object are not misleading.
- Group by surface → section → object. Show friendly names and breadcrumbs with technical paths available on demand.
- Each row shows change type, property, Before, After and Inspect action. Example: Display label — Requested role → Requested business role.
- Use stable identities rather than array positions. Reordering becomes a move, not delete/add. Preserve distinction between missing values, empty text, false and zero.
- Compare cloned identities only through an explicit supported lineage map. Do not guess matching by label. Ambiguous identities remain flagged.
- Include nonvisual differences such as permission, scope, rules and unknown branches. “Changed only” must not conceal configuration outside the selected preview surface; show its count and navigation.
- For unsupported/unknown content, provide a technical difference fallback rather than reporting no changes.
- Empty state distinguishes “No differences between these sources” from “Comparison unavailable.”

## 6. Findings and evidence

Separate three kinds of evidence:

| Evidence | Display rule |
| --- | --- |
| Local composition checks | Name the check scope and link findings to affected objects |
| Backend validation and tests | Show result, checked revision/hash and time; display Not run or Outdated where appropriate |
| Save/reread preservation | Show verified only after the full submitted graph matches its stored reread under supported identity normalization |

Do not show the prototype's blanket “unrelated configuration is preserved” success message based only on a render or empty change list. Preview validity does not establish backend or publication validity. Findings use severity, text and icon, with navigation to the affected object; avoid generic success banners that hide unresolved checks.

## 7. Reusable components and ownership

| Shared component responsibility | Business Partner adapter responsibility |
| --- | --- |
| Search toolbar and filter controls | Searchable graph attributes and qualification filters |
| Accessible object tree and responsive split layout | Graph ownership, stable IDs, labels and reference findings |
| Properties panel and source/status header | Supported properties, source lifecycle and preview provenance |
| Preview frame and comparison toolbar | Real renderer/compiler and supported simulation adapters |
| Difference list and findings panel | Identity comparison, graph preservation and validation evidence |
| Draft action bar | Save APIs, expected revisions, undo history and publication guards |

Audit existing platform components before extracting anything new. Extend a shared primitive only if its API and accessibility semantics fit other consumers. Keep schema-specific code out of generic UI packages. Use scoped classes and existing `--a-*` tokens; no broad element selectors, global font overrides or separate prototype CSS theme.

## 8. Delivery stages

| Stage | Deliverable | Exit condition |
| --- | --- | --- |
| UX-0: Baseline | Component/token mapping, preview coverage, reference screenshots, comparison-source contract | Every prototype control maps to existing capability or an explicit gap |
| UX-1: Workspace | Compact header, shared search, accessible tree, properties tabs and action bar | Search/selection/dirty state works on desktop and mobile; supported edits unchanged |
| UX-2: Preview | Shared preview frame, source selectors, split/unified modes and viewport switching | Qualified controls render with the real renderer; unsupported cases and simulation limits explicit |
| UX-3: Differences | Identity-based grouped changes, markers, Inspect and Previous/Next navigation | Reviewer can explain each visual and nonvisual change without needing JSON |
| UX-4: Evidence | Local findings, backend results and save verification with stale-state handling | Every success claim has a specific source revision and check behind it |
| UX-5: Qualification | Visual, accessibility, persistence and integration regression evidence | No lost edits, accidental preview writes, unrelated CSS changes or misleading source labels |

First delivery is UX-0 and UX-1. Continue into UX-2 and UX-3 using the same state model; do not ship a disconnected mock preview. Optional synchronized scrolling and additional preview scenarios follow the core review experience.

## 9. Test and completion checklist

- Fixtures: read-only release, editable draft, approved change set, active development preview, missing baseline, unsupported renderer, duplicate IDs, removed selection, no search results and network failure.
- Compare labels/help text, requiredness, additions, removals, moves and nonvisual configuration. Confirm unknown properties remain visible in differences.
- Exercise save/reload, undo, stale revision, timeout, dirty source/tab switching and changing a comparison base.
- Verify isolated preview input cannot alter graph values or call mutation endpoints.
- Check keyboard-only navigation, accessible names, focus restoration, status announcements and text alternatives for change colors.
- Check desktop at 1440px, tablet at 768px, mobile at 390px and 200% zoom. Compare shared controls with Neon and existing Studio consumers.
- Benchmark search with approximately 500 objects; optimize only demonstrated bottlenecks. Avoid virtualizing an accessible tree without evidence that it is needed.
- Keep screenshots and machine-readable results; label fixture evidence separately from live persisted or published evidence.

## 10. Separate work

Multi-draft branching, automatic merge, successor-publication recovery, new control renderers, arbitrary rule authoring and effective-user permission APIs are separate scope. UI refinement preserves approved revision 63 and existing release records. Editable screenshots can use a labelled fixture until a supported draft is available; no fixture revision or fork ancestry is presented as live state.
