# Rounding administration API review

The four rounding routes now use strict request/response schemas and a dedicated `rounding-control.ts` service. No rounding deployment flags or live financial configuration were changed by this work.

## Behavior

- Lists and simulations require `control.catalog.read`; writes require `control.finance_config.manage`. Both the route and service enforce Neon-only writes. Repository selection is exact-plane with no fallback.
- Save requires a nonnegative safe-integer `expectedVersion`: zero creates, positive versions address an existing tenant-owned ID. The path supplies the ID; the body cannot supply ID, tenant or version fields. Retirement requires a positive expected version.
- Missing tenant-owned rows return 404. Stale versions, ambiguous contexts and lifecycle conflicts return 409. Activated rules are immutable, matching the SQL rule contract: retire and replace them. Retired rules cannot be reactivated.
- Methods, names, precision, increment and nonempty context arrays are validated. Precision is 0–6. Increment is a positive decimal string within the SQL numeric(18,6) envelope; its supplied scale cannot exceed explicit precision. Unknown fields, malformed optional context fields and duplicate contexts are rejected.
- Simulation accepts signed decimal strings with up to 38 integer digits and 18 fractional digits. Exponents, nonnumeric strings and JSON numbers are rejected. It performs no writes or cache invalidation.
- Active matching contexts use the existing precedence score: company 4, currency 2, slot 1. A company-only rule therefore outranks currency plus slot. Equal highest scores are conflicts, including duplicate matching scopes; inactive rules do not participate.
- Calculation uses BigInt quotient/remainder arithmetic. HALF_UP ties go away from zero; HALF_EVEN ties choose an even increment multiple. UP means away from zero; DOWN and TRUNCATE mean toward zero. Output has the selected precision, with negative zero normalized away.
- Simulation requires explicit precision or an increment from which precision can be derived. This API has no currency-default reader and no longer invents integer rounding when both are omitted. Invalid stored definitions and foreign-tenant repository results fail closed with 503.
- Successful saves/retirements invalidate the tenant rounding namespace after persistence. Failed writes do not invalidate caches.

## Persistence and runtime integration still required

`RoundingRepository` remains an injected interface. The service's read-before-write checks improve errors but are not database concurrency guarantees. A concrete adapter must enforce expected versions, tenant ownership, active-rule immutability, context uniqueness, audit and outbox evidence within one transaction.

SQL stores `control.rounding_rule` separately from `control.rounding_context`, has no aggregate version column, and supports currency-derived precision. Implement explicit aggregate/context mappings, version migrations and currency-default resolution before claiming SQL/API parity. Canonicalize SQL numeric strings without losing precision; numeric(18,6) padding must not accidentally make a valid increment incompatible with its precision.

The finance runtime has a separate `RoundingResolver` and currency-default behavior. These API changes do not wire a saved configuration into posting calculations or make the two resolvers interchangeable. That integration needs real PostgreSQL and financial-runtime acceptance tests. No concrete adapter or live rounding deployment is claimed here.

## Verification

The service and HTTP tests cover signed ties, cash increments, large exact decimal amounts, specificity, ambiguity, invalid stored rules, strict request bodies, permissions, plane restrictions, optimistic version checks, terminal lifecycle and cache invalidation. The existing control-administration regression suite also passes. Database suites remain opt-in and are not rounding persistence evidence.
