# Phase 10 — Final deletion audit

Generated: 2026-07-20T03:09:15.437Z
Active workspace projects: 102
Inactive duplicate/legacy candidates: 29
Reference-free candidates (pre-gate): 0

> Reference-free is necessary but not sufficient. A candidate may be deleted only after the full build, database reset, hygiene, and smoke gates pass, and after its complete tree is backed up outside the repository.

| Package | Path | External references | Pre-gate status |
|---|---|---:|---|
| @athyper/config | packages/shared/business-domain/config | 197 | Blocked; references remain |
| @athyper/theme | packages/shared/business-domain/theme | 599 | Blocked; references remain |
| @athyper/ui | packages/shared/business-domain/ui | 319 | Blocked; references remain |
| @athyper/auth-bff | packages/shared/data-integration/auth-bff | 83 | Blocked; references remain |
| @athyper/icons | packages/shared/data-integration/icons | 64 | Blocked; references remain |
| @athyper/session-plane | packages/shared/data-integration/session-plane | 85 | Blocked; references remain |
| @athyper/finance-rules | packages/shared/finance-rules | 46 | Blocked; references remain |
| @athyper/config | packages/shared/platform-auth/config | 197 | Blocked; references remain |
| @athyper/cascade | packages/shared/runtime-domain/cascade | 47 | Blocked; references remain |
| @athyper/collaboration-ui | packages/shared/runtime-domain/collaboration-ui | 29 | Blocked; references remain |
| @athyper/config | packages/shared/runtime-domain/config | 197 | Blocked; references remain |
| @athyper/content-ui | packages/shared/runtime-domain/content-ui | 72 | Blocked; references remain |
| @athyper/domain-widgets | packages/shared/runtime-domain/domain-widgets | 13 | Blocked; references remain |
| @athyper/entity-print | packages/shared/runtime-domain/entity-print | 26 | Blocked; references remain |
| @athyper/finance-rules | packages/shared/runtime-domain/finance-rules | 46 | Blocked; references remain |
| @athyper/icons | packages/shared/runtime-domain/icons | 64 | Blocked; references remain |
| @athyper/query | packages/shared/runtime-domain/query | 52 | Blocked; references remain |
| @athyper/session-plane | packages/shared/runtime-domain/session-plane | 85 | Blocked; references remain |
| @athyper/temporal | packages/shared/runtime-domain/temporal | 70 | Blocked; references remain |
| @athyper/theme | packages/shared/runtime-domain/theme | 599 | Blocked; references remain |
| @athyper/ui | packages/shared/runtime-domain/ui | 319 | Blocked; references remain |
| @athyper/runtime-line-item | packages/shared/runtime-line-item | 29 | Blocked; references remain |
| @athyper/config | packages/shared/shared-infrastructure/config | 197 | Blocked; references remain |
| @athyper/theme | packages/shared/theme | 599 | Blocked; references remain |
| @athyper/ui | packages/shared/ui | 334 | Blocked; references remain |
| @athyper/config | packages/shared/ui-platform/config | 197 | Blocked; references remain |
| @athyper/finance-rules | packages/shared/ui-platform/finance-rules | 46 | Blocked; references remain |
| @athyper/i18n | packages/shared/ui-platform/i18n | 31 | Blocked; references remain |
| @athyper/temporal | packages/shared/ui-platform/temporal | 70 | Blocked; references remain |
