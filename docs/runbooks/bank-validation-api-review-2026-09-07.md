# Bank-validation API review — 2026-09-07

Scope: `GET /api/control-admin/bank-validation/rules`, `POST /api/control-admin/bank-validation/verify`, and `POST /api/control-admin/bank-validation/rules/publish`.

## Fixed behavior

- Checksum-enabled rules now check every nonempty supplied account. Local-looking or wrong-country values no longer bypass the checksum check when an account pattern is absent.
- IBAN-mode accounts are uppercased and presentation spaces removed before both pattern and MOD-97 checks. The overall IBAN length is capped at 34. Local identifiers retain their case and internal formatting.
- Supplied, permitted BICs receive an 8/11-character structural check; malformed values return `BIC_INVALID`. Required and prohibited BIC checks remain separate. BIC case and surrounding whitespace are normalized.
- Negative publication fixtures must select the rule being published. Previously an unrelated country, currency, or rail could produce `BANK_RULE_NOT_FOUND` and falsely satisfy a negative fixture.
- Service and HTTP boundaries validate required fields, optional-field types, rule flags, positive versions, priorities, patterns, and fixtures. No database write occurs for rejected rules.
- The rules-list contract declares an array. Verification and publication use specific response schemas. Tests enable response contract enforcement.
- Permission and non-Studio publication failures return 403, invalid input/rules return 400, and unavailable exact-plane repositories return 503 through the runtime's `HttpError`. Unknown failures remain generic 500 errors.

## Compatibility

Bank request schemas reject unknown properties. Country/currency inputs accept upper- or lowercase letters; stored rule country/currency codes must be uppercase. Rail and rule codes follow existing DDL code formats. Priorities fit the DDL's nonnegative smallint range. Identifier inputs are capped at 256 characters, patterns at 1,024, and fixture arrays at 100 entries. Versions must be positive safe integers.

Verification failures such as bad bank details or no applicable rule still return HTTP 200 with `valid: false` and issue codes. Empty fixture arrays remain supported; when supplied, fixtures must exercise their rule. Rule selection remains priority first, then currency specificity, then code. Publication preserves the supplied status and delegates persistence to the existing repository contract.

## Evidence and limits

- Control-admin package: 170 tests passed, including 77 new bank service/HTTP regression cases; production and test TypeScript checks passed.
- Control-admin contract package: 2 tests passed; production and test TypeScript checks passed.
- No concrete `BankValidationRepository` implementation was found in the repository. Database publication concurrency and deployed availability were not verified, and deployment flags were not changed.
- This is syntax, configured-pattern, and checksum validation, not account-existence, ownership, BIC-directory, or full country-registry verification. Country-specific account lengths and formats depend on the published patterns. Patterns still use JavaScript regular expressions; length caps are not a guarantee against pathological backtracking.

BIC structure was checked against [Swift's BIC specification](https://www.swift.com/standards/data-standards/bic-business-identifier-code). The generic IBAN length bound is described by [Wells Fargo's IBAN reference](https://www.wellsfargo.com/cib/global-services/resources/iban/).
