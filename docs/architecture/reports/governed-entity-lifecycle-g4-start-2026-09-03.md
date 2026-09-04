# G4 MESH data protection and stewardship — start report

**Status:** P0 clean-build correction landed; supported upgrade remains blocked  
**Date:** 2026-09-03

The audit confirmed that canonical `mesh.bank_account` stored a normalized bank-account identifier in clear text. Column-level SELECT restrictions reduced exposure but did not satisfy the protected-storage boundary.

Clean MESH provisioning now stores only an opaque tenant-scoped protected-value token, a non-reversible comparison fingerprint, masked last-four data and a protection key version. Active normalization and immutability triggers no longer read or derive data from a raw identifier. Bank metadata is capped at 4096 bytes.

No automatic historical rewrite is included. A database migration cannot safely manufacture vault tokens, and copying clear values through migration logs, snapshots or temporary ordinary tables would violate the P0 requirement. Supported upgrade therefore remains fail-closed until a vault-backed migrator can tokenize each value in memory, update by opaque token/fingerprint/last-four/key-version, verify counts and hashes, and drop the clear column without exposing it in evidence.

The executable readiness matrix is `server/db/ddl/planes/mesh/governed-lifecycle-g4-readiness.v1.json`. Purpose-bound retrieval/audit, rotation commands, JSON schema allowlists, structured addresses, strict URL handling, governed disclosure purposes, reconciliation cases and live leakage/cross-tenant probes remain open.
