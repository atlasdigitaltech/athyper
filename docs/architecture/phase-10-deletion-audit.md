# Phase 10 — Final deletion audit

Generated: 2026-07-25T06:27:23.883Z
Active workspace projects: 109
Inactive duplicate/legacy candidates: 31
Reference-free candidates (pre-gate): 0

> Reference-free is necessary but not sufficient. A candidate may be deleted only after the full build, database reset, hygiene, and smoke gates pass, and after its complete tree is backed up outside the repository.

| Package | Path | Workspace status | External references | Pre-gate status |
|---|---|---|---:|---|
| @athyper/document-runtime | packages/product-deprecated/runtime-ui/document-runtime | Active; remove from workspace with retirement | 2 | Blocked; references remain |
| @athyper/entity-runtime | packages/product-deprecated/runtime-ui/entity-runtime | Active; remove from workspace with retirement | 9 | Blocked; references remain |
| @athyper/config | packages/shared/business-domain/config | Excluded | 97 | Blocked; references remain |
| @athyper/theme | packages/shared/business-domain/theme | Excluded | 592 | Blocked; references remain |
| @athyper/ui | packages/shared/business-domain/ui | Excluded | 313 | Blocked; references remain |
| @athyper/platform-iam-auth-bff | packages/shared/data-integration/auth-bff | Excluded | 73 | Blocked; references remain |
| @athyper/icons | packages/shared/data-integration/icons | Excluded | 54 | Blocked; references remain |
| @athyper/platform-iam-session-plane | packages/shared/data-integration/session-plane | Excluded | 81 | Blocked; references remain |
| @athyper/finance-rules | packages/shared/finance-rules | Excluded | 37 | Blocked; references remain |
| @athyper/config | packages/shared/platform-auth/config | Excluded | 97 | Blocked; references remain |
| @athyper/cascade | packages/shared/runtime-domain/cascade | Excluded | 36 | Blocked; references remain |
| @athyper/collaboration-ui | packages/shared/runtime-domain/collaboration-ui | Excluded | 20 | Blocked; references remain |
| @athyper/config | packages/shared/runtime-domain/config | Excluded | 97 | Blocked; references remain |
| @athyper/content-ui | packages/shared/runtime-domain/content-ui | Excluded | 64 | Blocked; references remain |
| @athyper/domain-widgets | packages/shared/runtime-domain/domain-widgets | Excluded | 7 | Blocked; references remain |
| @athyper/entity-print | packages/shared/runtime-domain/entity-print | Excluded | 19 | Blocked; references remain |
| @athyper/finance-rules | packages/shared/runtime-domain/finance-rules | Excluded | 37 | Blocked; references remain |
| @athyper/icons | packages/shared/runtime-domain/icons | Excluded | 54 | Blocked; references remain |
| @athyper/query | packages/shared/runtime-domain/query | Excluded | 40 | Blocked; references remain |
| @athyper/platform-iam-session-plane | packages/shared/runtime-domain/session-plane | Excluded | 81 | Blocked; references remain |
| @athyper/temporal | packages/shared/runtime-domain/temporal | Excluded | 60 | Blocked; references remain |
| @athyper/theme | packages/shared/runtime-domain/theme | Excluded | 592 | Blocked; references remain |
| @athyper/ui | packages/shared/runtime-domain/ui | Excluded | 313 | Blocked; references remain |
| @athyper/runtime-line-item | packages/shared/runtime-line-item | Excluded | 21 | Blocked; references remain |
| @athyper/config | packages/shared/shared-infrastructure/config | Excluded | 97 | Blocked; references remain |
| @athyper/theme | packages/shared/theme | Excluded | 592 | Blocked; references remain |
| @athyper/ui | packages/shared/ui | Excluded | 321 | Blocked; references remain |
| @athyper/config | packages/shared/ui-platform/config | Excluded | 97 | Blocked; references remain |
| @athyper/finance-rules | packages/shared/ui-platform/finance-rules | Excluded | 37 | Blocked; references remain |
| @athyper/i18n | packages/shared/ui-platform/i18n | Excluded | 24 | Blocked; references remain |
| @athyper/temporal | packages/shared/ui-platform/temporal | Excluded | 60 | Blocked; references remain |
