# Country hardening release — DEV completion

## Deployment and governed publication

The three hardening/standardization stages are deployed in the existing source-mounted DEV services (API, worker, control API, Studio, Neon and Mesh). This is not a production image release. QA and Business Partner metadata were not changed by this release operation.

Country successor **release 8**, `1b7b9805-fe13-4439-9914-df5f4123684b`, is active in Studio, Neon and Mesh. Each target recorded successful Ed25519 signature verification, manifest validation and runtime compatibility. See `entity-hardening-release-receipts-20260928.json` for target evidence.

The proposal was authenticated by platform.admin with password and OTP; independent platform.owner password and OTP verification preceded policy activation. The existing dual-credential workload executed the approved, hash-pinned policy. No direct database activation or signature bypass was used.

## Compiler qualification

Compiler identity: `athyper.compiled-entity-artifact`, version `1.1.0`, build hash `7df1f477b29162ce75edc96127733798dcc36c95cd6b33f92195386b8fa2c6d0`.

Fingerprint coverage now includes the entity runtime and entity list contracts imported by the compiler, resolved through their declared metadata dependency owner. Local, API, worker and control-container identity probes matched. The five compiler boundary tests and host typecheck passed after the final resolution adjustment; the earlier combined compiler/workload/enrollment suite passed 28 tests.

## Settings preservation

Compared all five compiled artifact contents per plane against release 7. Changes were limited to the runtime descriptor's upstream source release hash, the regenerated operation binding IDs (`bindingId`, `scopeBindingId`, `sourceEntityOperationId`), and its corresponding artifact hash. Profiles, collaboration bindings, field definitions, permissions and presentation settings were unchanged. Comments remain Private by default. Historical signed payloads were not edited.

## Post-activation checks and remaining manual acceptance

All six affected DEV services are healthy. Country list URLs return HTTP 200 in all three planes. These availability checks are not signed-in functional acceptance. User testing after this release remains the final manual check for Country list/manage/detail, collaboration and navigation behavior.
