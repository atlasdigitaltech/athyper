# Database reports

Only ongoing read-only database reports belong here.

| Report | Scope |
| --- | --- |
| `mesh-authorization-quality.ts` | Mesh |
| `database-drift.ts` | Studio, Neon, Mesh |

Historical migration, capture, contraction, and legacy-write evidence belongs
in the repository archive, not in the active database workspace.

The former Neon authorization-anomaly and finance-FX reports targeted retired
tables (`control.authorization_anomaly_disposition` and
`control.payment_method_company_policy`) and no longer have package entry
points. Authorization readiness is certified by the canonical inventory,
promotion, release-gate, and live RLS commands; finance needs a new report
owned by its current policy authority rather than a compatibility query.
