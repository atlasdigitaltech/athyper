# Country route denial after DEV restart

Observed 2026-09-28: the shell denied `/app/entity/country` after DEV restart/recreation.

Read-only checks confirmed Country release 10 remains active in studio, neon and mesh, with two published operation bindings per plane. CATL's active `test.full_admin` role retains `common.platform.reference.view`. The restarted source API had neither `METADATA_FORMAT_ROUTING` nor compiled-only plane configuration. Its reader therefore selected legacy descriptors, while Country is published as split compiled artifacts. Route admission uses that same reader.

Restored `METADATA_FORMAT_ROUTING=true` in the private DEV source and full-source Compose definitions, then recreated only API, worker and scheduler. All three are healthy. Updated `configureDevPublication` in the repository's DEV workspace generator to persist format routing in both presets, preserving compiled-only settings and existing fail-closed reader behavior. No metadata publication, record writes or permission grants were needed.

Validation: four DEV configuration tests and three metadata-format/route-admission tests passed; scoped diff whitespace check passed. Adjusted the publication mount assertion to inspect its specific mount, independent of an existing local protected-value mount. Live container environment confirms routing is enabled.

Authenticated browser acceptance remains pending: saved CATL browser sessions return 401. Refresh Country in the user's current authenticated browser to confirm the route and record UI end to end.
