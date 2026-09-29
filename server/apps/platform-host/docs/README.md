# Platform host documentation

Start with [architecture](architecture.md), [module ownership](module-ownership.md),
[dependency rules](dependency-rules.md), and [deployment profiles](deployment-profiles.md).
These describe current source boundaries and the remaining deployment constraints.

Extraction checkpoints, consumer inventories and publication audits in this
folder record decisions and evidence at the time they were captured. Their old
paths and hashes are historical; rerun the inventory tools for current ownership.
Compiler and test output snapshots are archived under [history](history/).

The layout audit moved 17 modules and 50 focused tests to their owners. All 107
host test files remain discoverable. The host build passes; the full host suite
has 775 passing, 11 baseline failing and 26 skipped tests. This establishes source
and test-discovery parity, not full qualification or percentage coverage.
