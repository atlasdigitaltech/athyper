# Adding the first business module

A business slice supplies contracts, typed operations, server routes, a plane route entry, and page/components. It does not create infrastructure already owned by the spine.

1. Define request/response schemas and `createOperation` declarations in a contract or domain-client package. Browser calls default to `/api/relay`; add the matching method/path to the shared relay allowlist through an explicit exported operation.
2. Register the server route with independent authentication, exact-plane context, permission enforcement, input validation, and repository transaction rules. UI visibility is never authorization.
3. Add the frontend path to the owning plane registry with its DDL module code, exact permissions, effective features, icon, and navigation presentation. The Phase 8 policy rejects unknown modules, codes, icons, and missing pages.
4. The page consumes `useApiClient`, platform query-key factories/hooks, `PermissionGate`, `FeatureGate`, `RouteGuard`, `runGuardedMutation`, UI primitives, surface-kit, and the existing shell. It does not add a fetch wrapper, bearer token, auth flow, provider root, raw permission parser, cohort evaluator, or navigation mirror.
5. Test schema fixtures, relay behavior, server denial after visible allowance, query cancellation, keyboard/accessibility behavior, and exact-plane isolation. Add the slice to deployment package closure only when it becomes an active dependency.

The extension points are exported by `@athyper/platform-api-client`, `@athyper/platform-query`, `@athyper/platform-shell-app-foundation`, `@athyper/platform-shell-runtime`, `@athyper/platform-ui`, and `@athyper/platform-surface-kit`.
