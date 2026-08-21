# Phase 9 Publication backup-package retirement record

`server-backup/packages/services/publication` is behavioral reference only. Running host composition imports Publication exclusively from `server/packages/contracts/publication`, `server/packages/services/publication`, and the current adapters.

Retirement conditions:

- no executable import resolves to the backup package;
- characterization coverage is retained in the current service package;
- three-plane container behavior and crash/restart recovery gates pass;
- canary rollout and governed rollback evidence are attached;
- repository owners approve deletion under the repository's backup-retention policy.

Status on 2026-08-10: isolated from runtime composition; physical deletion is intentionally pending the external integration and rollout evidence gates. The backup directory must not be packaged into a production image.
