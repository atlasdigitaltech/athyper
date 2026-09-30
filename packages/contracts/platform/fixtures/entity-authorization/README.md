# Entity authorization fixtures

These are versioned parser and policy qualification inputs, not installed releases.

- `business-partner.v1.json`: BP adoption candidate. Adds explicit discovery/app
  references and target scopes; new operations/bindings require reviewed publication.
  Root scalar fields only; nested providers need separate field-policy profiles.
- `company-invoice.v1.json`: synthetic company-owned transaction used to test the
  generic scope resolver and target authorization. No deployed invoice module is implied.
- `independent-document.v1.json`: synthetic workspace-owned child demonstrating
  independent admission and masked-field handling.

Do not provision permissions or derive global grants from these fixtures. See
the [adoption runbook](../../../../../docs/runbooks/entity-authorization-adoption.md)
for actual implementation status, dry-run commands and activation gates.
