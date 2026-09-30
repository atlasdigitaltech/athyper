# Partner commodity classification backfill

**Explicit DEV cutover applied; metadata release 21 active.** Read the [implementation checkpoint](../../../../../../docs/architecture/application-experience/partner-classification-separation.md) before use.

The canonical backfill is now `server/db/ddl/planes/neon/master/29a_partner_classification_backfill.sql`. It follows storage file 29 and precedes legacy writer cutover file 30, inside an explicit transaction on a privileged migration connection. It does not disable RLS or triggers. Source locks prevent concurrent changes during reconciliation; original rows remain unchanged.

Verification and the DEV-only installer:

```sh
pnpm exec tsx tooling/scripts/verification/verify-partner-classification.disposable.mts
node tooling/scripts/local-dev/install-partner-classification.mjs --dry-run
```

The installer defaults to rollback. Explicit application requires `--apply --confirm=LOCAL-PARTNER-CLASSIFICATION`; it installs storage, historical lineage, permissions, legacy-write guards and the bounded governed-function replacements atomically. It refuses an already-installed target: historical backfill must not be replayed after new commands or legacy draft activation. Existing DEV is already installed. Fresh builds use the same ordered canonical files; no automatic production upgrade or human grant is introduced.
