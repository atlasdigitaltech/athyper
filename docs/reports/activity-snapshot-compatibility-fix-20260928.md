# Snapshot comparison after publication

The two saved Country snapshots were captured under release 9. Release 10 changed the runtime artifact hash (including release coordinates) without changing the stored record interpretation. The Activity provider incorrectly required an exact match with the current artifact hash before reading either snapshot, producing `ACTIVITY_SNAPSHOT_CONTRACT_MISMATCH`.

The provider now resolves a differing historical hash only from tenant-scoped immutable payloads with signature verification evidence and prior activation. It requires exact equality of entity identity, plane, descriptor schema, storage and complete field definitions against the pinned current artifact. Missing history or incompatible definitions still fail closed. Each snapshot passes this check independently; differing release hashes alone no longer prevent comparison. Current admission, readable-field projection, payload validation and the intersection of authorized comparison fields remain enforced. This does not provide schema migration or collection mapping.

Validation:

- 23 focused provider/compatibility tests passed, including cross-release comparison, restricted-field omission and changed type/storage/identity rejection.
- Host typecheck passed; whitespace validation passed.
- Both existing Country snapshot coordinates resolve to release 9; its record interpretation passes the new check against the live release-10 artifact.
- The historical lookup succeeds under `athyper_runtime` with the tenant context in a read-only transaction.
- DEV API restarted and healthy. No metadata republish, snapshot mutation or permission changes were required.
- A broader host run also reported two failures in `metadata-records-vertical.test.ts` (record creation returned 500); 740 tests passed and 26 were skipped. These failures are outside the snapshot comparison cases and are not represented as passing.

The authenticated browser POST has not been replayed from the user's session; manual retry of the existing two snapshots is the final UI check.
