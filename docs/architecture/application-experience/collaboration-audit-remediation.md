# Comments and Files audit remediation

## Delivered behavior

- Draft emptiness uses semantic content, including mentions and attachments. Pending image uploads do not cause draft deletion.
- A dependency-free rich-text contract shares plain-text projection, URL policy, meaningful-content detection, and reply-depth policy between browser and server consumers.
- Internal clipboard documents are checked for node shape, nesting, size, child placement, attachment/mention identities, marks, and safe links before editor insertion. Rendering checks link protocols again.
- File browsing owns its request lifecycle in a hook: abort on filter/context change, reject stale pages, prevent overlapping pagination, refresh on record data changes, and keep errors outside action dialogs.
- Filename and content search share filter serialization and show only the active mode's pagination.
- Filtered attachment summaries carry pin metadata. Opening missing version history fetches it on demand under attachment version authorization and record-link constraints.
- File deep links resolve a record-scoped attachment independently of loaded pages, under preview authorization. Missing and denied files use the same neutral notice.
- Comment submission errors have one display owner. Reply-busy feedback stays beside the composer and clears after completion.
- Mentions queries select threads with a mention in the visible root or visible descendants before pagination. Deleted mentions are excluded, and traversal uses the existing visible-ancestor policy.
- Automatic comment/reply deep-link paging is bounded; manual continuation remains available.
- Upload admission locks before asynchronous duplicate checking. Record and version uploads share one lifecycle adapter. Retry controls use queue state.
- File dialogs use a discriminated state. Status polling is extracted into a lifecycle hook with cancellation.
- Empty content-search pages with a continuation cursor explicitly offer further results. Cursor comparison and discovery ordering use UUID ordering consistently.

## Deliberate boundaries

Processing files remain excluded from discovery: pending-upload status remains visible in the record list to its uploader. Discovery does not broaden this visibility.

HTML serialization and React rendering remain separate presentation adapters. Server validation remains authoritative; browser clipboard validation protects editor insertion.

Upload-policy reads remain fresh rather than introducing an authorization-sensitive cache. This optimization is optional and must retain tenant/principal/authorization/release isolation if introduced later.

## Verification

Focused tests cover draft semantics, clipboard rejection, browser/server projection parity, stale browse pagination, refresh after mutations, file lookup authorization, filtered history, reply mentions pagination, single error alerts, and rapid upload admission.

Browser suites cover Comments actions, Files discovery, and collaboration pagination. Server suites cover Attachments, Collaboration, and Experience. These use fixtures/mocks; a live PostgreSQL integration run was not performed.
