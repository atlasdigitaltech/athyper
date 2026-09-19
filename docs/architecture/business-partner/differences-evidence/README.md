# Differences and linked navigation

Implemented a scoped, token-styled differences panel with added/changed/removed counts, search by object/property/path, change-type filters, and selected-surface scope. Scope checks both graphs so removed or moved objects remain discoverable. Before/after property values remain accessible alongside expandable raw values.

Links resolve against the current working graph. Historical-only objects retain stored values without a broken edit link. Navigation preserves source/object identity, clears workspace filters, expands the tree, switches mobile Properties, and focuses the properties panel. Return to differences preserves comparison/filter state. URL-controlled selection retains the transient reveal instruction.

Validation: ten focused review/workspace tests pass, including removed-object filtering and focus return; package TypeScript check passes. Authenticated live Studio page renders the new controls; 390px viewport reports no document overflow. No saves or publications performed.
