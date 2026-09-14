# Local policy reports and repository exceptions

Reports are local-only by default. Keep writing local verification, deployment,
approval and recovery evidence here; the directory's `.gitignore` excludes it
from ordinary Git adds. It does not delete files, prevent force-adds, or remove
copies from earlier commits.

## Files retained for repository checks

[tracking-policy.json](tracking-policy.json) explicitly lists 11 deterministic
test inputs and three generated policy/test inventories. It records each test
input's checksum and consumers. These exceptions preserve linked contract
identifiers and hashes; they must not be interpreted as current approvals or
as a general authorization to publish tenant-specific evidence.

Local operational scripts still read reports at their existing paths. A fresh
clone will need private evidence generated or restored before those operational
scripts can run. The automated test inputs remain allowlisted, so tests must not
be changed to depend on arbitrary ignored local output.

To add or change a repository exception, review its contents and consumers,
update `tracking-policy.json` and `.gitignore` together, and run
`node --test tooling/scripts/policy/report-tracking.test.mjs` plus the affected
consumer tests. New reports are not automatically allowed by extension or name.
Never force-add an entire report directory.

## Local preservation and Git history

All reports present before the tracking change were privately backed up, including
their prior Git-index versions, under:

`~/.athyper/backups/report-tracking/20260914T055151Z/`

`manifest.json` records local SHA-256 values and prior index entries;
`reports-and-index-before.tar.gz` preserves the original local bytes and index
blobs. Existing report contents were not modified. Ignored files still need
private backups as new reports are generated.

Removing an entry from the Git index stages a repository deletion while keeping
the local file. Commit review is still required; nothing was pushed and existing
GitHub/history copies are unaffected. Sanitizing other tracked governance trees
or rewriting repository history is outside this report-directory change.
