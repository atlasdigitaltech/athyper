# Documentation

## Start here

- [Local development](runbooks/local-development.md): current daily commands.
- [Shared DEV workspace](runbooks/shared-dev-workspace.md): source/image modes,
  infrastructure, previews and recovery.
- [Deployment](../deploy/README.md) and [container wiring](../deploy/docs/operations/container-wiring.md).
- [Architecture index](architecture/README.md) and
  [Business Partner architecture](architecture/business-partner/README.md).
- [Business capabilities and workflow design](business-workflows/README.md): seven
  NEON workspace documents covering 32 modules, with an internal evidence matrix.

## Find the right kind of document

| Directory | Purpose |
| --- | --- |
| [architecture/](architecture/) | Architecture decisions and design guidance; follow document status labels. |
| [contracts/](contracts/) | API, behavior and integration contracts, including explicitly proposed contracts. |
| [runbooks/](runbooks/) | Operator procedures and named historical execution records. |
| [operations/](operations/) | Operational guidance and its supporting evidence. |
| [reviews/](reviews/) | Dated findings, implementation reviews and cleanup records. |
| [examples/](examples/) | Examples and retained qualification evidence, including historical snapshots. |
| [ui/](ui/) | UI guidance and design documentation. |
| `customer/` | Private local customer documents; ignored by Git. Preserve signed sources and original delivery packages. |

## Status and retention

A dated report records what was observed for its particular source, deployment
and time. It does not establish the current environment's health or renew an
approval. Historical rebuild and isolated-development documents point to the
current shared DEV instructions. Follow those links before executing commands.

Keep generated inventories used by tooling at their supported paths, including
`architecture/generated/ddl-service-coverage.json` and the server route manifests.
Bulky review exports remain beside their linked recommendations until their
consumers and regeneration paths can move together. Do not remove evidence just
because it is generated or old.

See the [14 September cleanup record](reviews/docs-cleanup-20260914.md) for
deduplication, repaired links and private archive recovery details.
