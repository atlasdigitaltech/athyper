# Local artifacts and authoring exports

Generated evidence belongs outside the checkout. Canonical source definitions stay
in their owning packages; diagnostic SQL lives in `server/db/scripts/tests/integration/`
and implementation notes in `docs/reviews/`.

| Content                     | Default location                                                |
| --------------------------- | --------------------------------------------------------------- |
| Verification output         | `~/.athyper/instances/<instance>/artifacts/<feature>/<run-id>/` |
| Local DEV authoring exports | `~/.athyper/instances/dev/authoring/business-partner/`          |
| Candidate workspaces        | `~/.athyper/candidates/<candidate-id>/`                         |

`tooling/scripts/artifact-paths.mjs` resolves new evidence paths. Local runs default
to DEV and a timestamp plus process ID. Set `ATHYPER_INSTANCE=qa` for tools targeting
QA; DEV-specific browser/activation scripts explicitly retain DEV. Changing this
variable does not change a script's target URL or credentials.

Set `ATHYPER_RUNTIME_ROOT` to relocate the private root. `ATHYPER_ARTIFACT_ROOT`
overrides the artifacts base and `ATHYPER_ARTIFACT_RUN_ID` selects a shared run ID
when several commands contribute evidence. Use a unique run ID to retain previous
results. CI sets both variables and uploads output from outside the checkout.
Static-policy output adds `<profile>/` inside its run directory. Explicit CLI output
arguments continue to take precedence where supported.

## Migrated files and recovery

The September 2026 relocation preserved existing generated files under each
feature's `imported/` run, including the requests restoration receipt and the
unresolved `unified-form-layout/failure.png`. The onboarding export moved to the
DEV authoring directory. It contains tenant-specific revision coordinates and is
neither a canonical definition nor release qualification.

Each file was copied with its timestamp and verified using SHA-256 before removal
from the checkout. The private relocation manifest maps original paths to their
new locations, including SQL and notes:

`~/.athyper/backups/artifacts-metadata-relocation/20260914T043348Z/manifest.json`

The original folder READMEs are alongside that manifest. Historical receipts retain
their original paths and hashes; resolve those paths through the manifest.

`prepare-bank-country-capture.mts` reads the retained
`instances/dev/artifacts/collection-presentations/imported/region-readback.json`
under the runtime root. Set `ATHYPER_COLLECTION_READBACK` to an explicit newer
readback file when preparing another candidate. The script still validates and
contract-tests its input before writing the candidate surface.

An earlier cleanup archived superseded files separately:
`~/.athyper/backups/artifacts-metadata-cleanup/20260914T040852Z/`.
Its `before-cleanup.tar.gz` uses repository-relative paths and its `manifest.json`
provides recovery coordinates. Extract to a temporary directory before selectively
restoring files. Do not overwrite newer evidence or rewrite historical receipts.
