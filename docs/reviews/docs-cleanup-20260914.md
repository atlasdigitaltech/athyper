# Documentation cleanup — 14 September 2026

The pre-cleanup tree contained 595 files. A complete owner-only snapshot and
SHA-256 manifest were written and verified before changes:

`~/.athyper/backups/docs-cleanup/20260914T041147Z/`

`docs-before-cleanup.tar.gz` stores original paths relative to the repository
root. Recover selected files into a temporary directory first, so a restore does
not overwrite newer edits. The archive includes private customer documents.

## Changes

- Removed 18 Windows `:Zone.Identifier` sidecars and added an ignore rule.
- Consolidated 14 exact customer-file duplicates into the retained working pack.
  The extracted delivery pack's distinct workbook, design and README remain.
  Its consolidation index maps former files to matching retained copies.
- Consolidated 41 identical Atlas F6 historical receipt copies. All 14 distinct
  historical files remain in the archive directory. Its index retains the
  original hashes and recovery location, since current copies may later change.
- Restored the exact missing Word solution document from the original delivery
  ZIP. No signed document, workbook or original delivery ZIP was modified.
- Updated customer links to consolidated documents and corrected the signed-BRD
  relative path.
- Added the documentation index, separated current DEV commands from historical
  isolated-runner guidance, and labeled the two September 6 rebuild records.
- Retained generated inventories consumed by tooling and the bulky review
  exports linked from recommendations. Prior qualification receipts were not
  rewritten or relabeled as current acceptance.

The 73 removed files occupied 1,810,525 bytes; the restored Word copy is 100,685
bytes. Net space savings are approximately 1.6 MiB before the small new indexes.

## Verification

All 595 original files were checked against the private archive. Exactly 73
files were removed; retained non-Markdown files match their original hashes.
The restored Word document matches its ZIP member byte for byte. No Windows
sidecars remain, and all scanned relative Markdown link targets under `docs/`
exist. Whitespace checks passed for the changed tracked documentation and ignore
rules. External URLs and Markdown anchors were not part of this check.
