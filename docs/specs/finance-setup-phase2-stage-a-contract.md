# Finance Setup Phase 2 — Stage A Contract

Status: Implemented contract baseline

## Locked ownership scopes

| Scope | Contract |
|---|---|
| Platform | ISO currencies and canonical Finance vocabularies |
| Tenant | Reusable FX rates, tax definitions, payment definitions, banks and interface profiles |
| Legal Entity | Statutory identity; multi-registration storage remains a separately approved extension |
| Company | Adoption, defaults, routing, House Banks and operational policy |
| Company + Book | FX, settlement and posting-role account determination |
| Operational | Payments, statements, reconciliations, calculations and revaluation evidence; never setup CRUD |

The canonical lookup is `finance.setup_scope_type`.

## Locked readiness and lifecycle vocabulary

Domain readiness uses `not_applicable`, `not_started`, `in_progress`, `blocked`, and `ready`.
Certification remains a separate governance state and can be `uncertified`, `certified`, or `stale`.

Configuration lifecycle classes are:

- `definition`: draft, active, inactive.
- `effective_policy`: draft, active, inactive, superseded.
- `temporal_link`: scheduled, effective, ended. Generic delete and retire are forbidden.
- `operational_evidence`: owned by its runtime document lifecycle and excluded from setup CRUD.

## Decisions

1. FX policy is stored in `control.fx_policy`. Precedence is Company+Book, Company, then Tenant, with transaction context, effectivity, and priority applied inside the selected scope. Triangulation is disabled unless an explicit pivot currency is present. `master.get_fx_rate()` no longer supplies an implicit MYR pivot.
2. Tax rounding is owned by the Tax Group aggregate through `control.tax_group.rounding_rule_id`. There is no hidden application fallback and no Company override in this release.
3. `master.bank_account_link` is a temporal link. It is ended through `master.end_bank_account_link()`; generic delete, cancel, deactivate, and retire operations are absent from Entity metadata.
4. `control.bank_interface_profile.config` contains non-secret routing configuration only. Secret-shaped JSON keys are rejected recursively. Credentials live in the platform secret provider and are represented by opaque provider/reference, version, health, validation, and rotation fields.
5. The secure command surface will accept credentials only on rotate/set requests, write them directly to the secret provider, and return only status metadata. Ordinary reads, generic Entity mutations, audit payloads, and errors must never contain credential material.
6. Canonical tax posting roles now cover output tax, nonrecoverable input tax, reverse charge, WHT receivable, rounding variance, and suspense. They are `required_when_used`, so readiness derives requirements from enabled Tax Group capabilities rather than imposing every role on every Company.
7. Organization multi-registration remains deferred. The initial Company tax registration fields continue to represent one primary registration and the UI must state that limitation.

## Secure credential command contract

Planned governed commands:

```text
POST /finance/setup/bank-interfaces/{profileId}/credentials:set
POST /finance/setup/bank-interfaces/{profileId}/credentials:rotate
POST /finance/setup/bank-interfaces/{profileId}/connection:test
```

Credential request bodies are write-only, excluded from request logging, and never persisted in database JSON. Responses contain `credentialStatus`, `credentialVersion`, `lastValidatedAt`, and audit correlation only.

