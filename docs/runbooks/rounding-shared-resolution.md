# Shared control and finance rounding

The control-admin simulator and finance now use
`server/packages/foundation/src/decimal-rounding.ts` for precision/increment resolution
and exact integer arithmetic.

Resolution follows the finance precedence:
- Precision: explicit rule precision, otherwise active currency minor units.
- Increment: explicit rule increment, otherwise currency metadata rounding increment,
  otherwise one unit at the resolved precision.
- Missing precision is an error. The increment's number of decimal places does not
  implicitly select the output precision.
- The increment must be positive and exactly representable at the resolved precision.
  Trailing zeroes do not count as extra precision.

For JPY with increment `0.05` and omitted precision, both paths reject the configuration.
An explicit precision of 2 permits that rule and both return `1.05` for input `1.05`.
An increment-only rule with no currency context fails instead of inventing precision.
The finance calculation entry point also validates supplied evidence, preventing direct
callers from triggering the old truncation.

`RoundingRepository.getCurrencyDefaults` is now required. The Kysely implementation
reads active `shared.currency.minor_units` and `metadata.rounding_increment`, matching
the finance reader. Custom repository implementations must supply this method.
New currency-scoped API writes validate the resolved increment before persistence.
Generic increment-only rules can be stored for currency-specific use; evaluation still
requires sufficient context.

This change does not alter rule selection, API responses, finance evidence shape or the
API's existing requirement that a simulation match a rule. Finance's currency-only
fallback remains available when no rule matches.

Validation: 766 control-admin tests and 54 finance tests passed. Twelve new parity and
rejection regressions cover JPY, two/three-decimal currency settings, cash increments,
explicit precision, trailing zeroes, missing currency, incompatible new writes and
direct evidence validation. Foundation, control-admin, finance and host typechecks passed.

No schema migration is required. Existing incompatible configurations are rejected rather
than silently converted. Deploy API and finance consumers together; the currently running
local image has not been replaced by this build. Fresh PostgreSQL mutation and browser
acceptance were not performed for this change.
