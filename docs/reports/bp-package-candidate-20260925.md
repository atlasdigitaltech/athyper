# Initial Business Partner package candidate

Created from the user-authorized CATL working definition as source material, not as inherited product approval.

- Candidate hash: `5e4ab67e8501f56b5b7533822d1f06302e37e0377777444fd644210925e15c6f`
- Local immutable candidate: `~/.athyper/instances/dev/candidates/business-partner-package/5e4ab67e8501f56b5b7533822d1f06302e37e0377777444fd644210925e15c6f.json`
- Native preview: revision 9, verified Ed25519 source signature; hash `a8072522641c3849a406c46f54888a6caff97f10a6ee97520e2fe263fc16b1cd`.
- Compiled source: release 22, artifact hash `0c37e4c13904b0586c4b591e906ee5e80753f3e57a99f4affd37a6c2e6e154fa`.
- Content: eight native fields and 120 compiled artifacts. Native parsing, compiled publication parsing, native storage-column checks and CATL-binding string scans passed. These are structural checks, not complete semantic/security approval.
- Source heads rechecked before candidate write. CATL preview, activation heads, business records and permissions unchanged.

## Reproduce

```sh
pnpm exec tsx tooling/scripts/local-dev/prepare-bp-package-candidate.mts
pnpm exec tsx tooling/scripts/local-dev/prepare-bp-package-candidate.mts --write
```

The first command validates without writing. The second writes a content-addressed, owner-only candidate outside the repository. Exact replay preserves the candidate; conflicting content fails. The preview database is opened read-only. No signing private keys are read.

## Canonicalization finding

The scoped release-22 publisher orders JSON object keys using `localeCompare`; the standard signing helper uses sorted code-point keys. Consequently, the same stored payload has different hashes under these encodings. Source capture explicitly verifies release 22 using its historical encoding and creates the new candidate hash using the standard canonicalizer. The source payload's recorded verification evidence is retained as provenance; it is not a newly verified product signature. A new publication must consistently use the standard signer/loader format, not reuse the legacy signature.

## Status

Draft candidate prepared and validated; not approved, signed as a product release, registered in Studio, dispatched, or activated. Durable review, publication materialization and worker dispatch remain necessary. The live Athyper descriptor is still not activated by this capture step.
