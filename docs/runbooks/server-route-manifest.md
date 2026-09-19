# Server route manifest verification

Routine verification reads current `server/` source and the versioned baseline at
`governance/config/governance/server-legacy-route-baseline.json`. It does not read
`server-backup/`, require Git history, or access the network. The generated JSON
and Markdown manifests in `docs/architecture/` are versioned review artifacts.

After changing routes, regenerate and review the manifest:

```sh
pnpm routes:server-manifest
pnpm routes:server-manifest:check
pnpm test:url-catalogue
```

Include the resulting manifest changes with the route change. CI runs the check
without regenerating files, so stale artifacts fail verification. Source line
changes can also require regeneration. A structural match does not establish
behavioral, authorization, or response-contract parity.

## Recovered legacy evidence

The initial baseline preserves all 898 legacy route occurrences (868 normalized
identities) from the historical `docs/architecture/server-route-manifest.json` at
commit `eca025d0d05c42e0f2a2536e944446f3bd2fa245`. Its provenance records that commit,
file path, and the SHA-256 of the exact historical manifest bytes. This is recovered
route evidence, not a claim that the original legacy source tree has been restored
or reverified. Current routes from the historical file are not used.

## Explicit baseline refresh

Only refresh when intentionally replacing the historical comparison reference.
Restore the authentic legacy source snapshot into `server-backup/`, then run:

```sh
pnpm routes:server-manifest:refresh-legacy
pnpm routes:server-manifest
pnpm routes:server-manifest:check
```

The refresh command requires a nonempty route inventory. It records a deterministic
SHA-256 of the scanned source files using sorted workspace-relative paths and exact
file bytes, each prefixed with its byte length and a colon. Tests, fixtures, and
build outputs are excluded using the generator's normal scan rules. Refresh
replaces the baseline; review the provenance and route differences before committing
it along with the regenerated manifest. Do not use the current server or an empty
directory as a substitute for historical source.

## Unavailable legacy evidence

Normal verification fails if the baseline is missing or invalid. Restore the
versioned baseline from source control. If legacy evidence cannot be recovered,
a deliberate current-routes-only run is available:

```sh
pnpm routes:server-manifest --current-only
pnpm routes:server-manifest:check --current-only
```

This mode reports `legacyParity.status: "unavailable"`, uses null parity counts,
and labels routes `current-uncompared`. It cannot satisfy the normal CI parity
check. Enabling it as the permanent CI policy requires an explicit policy change;
it is never an automatic fallback.
