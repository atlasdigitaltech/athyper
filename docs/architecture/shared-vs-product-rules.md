# Shared versus product-specific rules

Shared code must be reusable without knowing which product consumes it. It may contain contracts,
platform services, runtime primitives, reusable UI, and product-neutral business rules.

Product code may contain product screens, workflows, field renderers, API adapters, routes,
configuration, and business composition for exactly one product. It may depend on shared packages
but never on another product package.

If a feature has consumers in two products, keep its reusable core shared and place product-specific
composition in each product package. If it has no consumer outside one product, move it there only
after repository-wide consumer verification.
