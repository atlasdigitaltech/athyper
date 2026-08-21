# Finance Setup Phase 2 — Stage C Tax

## Approved aggregate contract

- `control.tax_group` is the stable identity referenced by documents and resolution rules.
- `control.tax_group_version` owns effectivity, compound behavior, and the mandatory rounding rule.
- `control.tax_group_component` belongs to one version and its sequence defines calculation order.
- Active versions, active WHT thresholds, and active registrations cannot overlap within the same resolution scope.
- Equal-priority Tax Resolution Rules whose scopes can match the same transaction are rejected.

## Registration decision

Multi-registration storage is approved as a normalized aggregate in
`master.organization_tax_registration`. A registration is owned by a Legal Entity and may be
restricted to one Company Code. This supports multiple jurisdictions and registration types
without repeating statutory data on every Company. Existing single-registration Company fields
remain a read-only compatibility fallback until data migration is complete.

## Runtime contract

Posting resolves the effective active Tax Group Version for the document date, evaluates its
components in sequence, applies compound bases where configured, and requires explicit rounding.
Currency minor units may supply precision only when the selected rounding rule omits it. WHT
thresholds are selected by jurisdiction, tax type, optional section, and effectivity.

The simulator returns every candidate rule and rejection reason, ambiguity state, winning group
version, component calculations, WHT threshold trace, rounding adjustments, and required posting
role coverage.

## User interfaces

- Company Tax Profile: registrations, readiness, effective groups, simulator, and posting-role coverage.
- Tenant Tax Configuration Workbench: Tax Group/version editor, component ordering, rounding selection,
  activation, and WHT threshold maintenance.

## Verification

Run the Stage C contract suite with:

```powershell
pnpm --filter @athyper/svc-finance test --run __tests__/finance-tax-stage-c.contract.test.ts
```

After deploying the database migrations, run the catalog/RLS integration contract with
`RUN_FINANCE_INTEGRATION=1` and `FINANCE_INTEGRATION_DATABASE_URL` configured.
