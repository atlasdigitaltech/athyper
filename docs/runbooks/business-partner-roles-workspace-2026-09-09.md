# Business Partner overview and Roles & scope workspace

The 360 View retains shared partner information and banking facts. Role/company configuration is now a top-level Roles & scope tab. Older published panel layouts are upgraded by the BP adapter while retaining their other tabs and sidebar providers; the publication source and compatibility definitions match the new layout.

Roles & scope shows partner roles and an authorized company matrix. Company counts deduplicate operating organizations, and role/organization existence does not imply an active company profile. Each company/organization/role row is authorized before its name or status is returned. A missing row is labelled “Not enabled or not visible” to avoid presenting inaccessible data as absent.

A selected company carries across Buying & Payables, Selling & Receivables and Bank accounts. A unique authorized operating organization is resolved automatically; ambiguous participation requires selection. Scope details are expandable. Configuration links and extension requests carry explicit company, organization and role coordinates instead of inheriting the shell company. Legacy company-section links still open the new workspace.

Banking in the 360 shows shared facts; company usage, acceptance and preference are in the company workspace. Bank assignments expose stable assignment IDs and explicit current-acceptance flags, allowing relationship summaries to deduplicate local-account and received-disclosure projections. Multiple account assignments remain supported by the existing usage model.

The relationship overview includes authorized company counts, setup gaps, bank acceptance-review counts and configuration links. Company and requested reporting-period controls are visible. DEV currently installs unavailable providers for procurement, finance, sales, projects and contracts: spend, revenue, delivery, quality and payment metrics are explicitly unavailable, never invented or displayed as zero. Any available operational snapshot is labelled with its own observation date, separately from requested-period totals. Risk navigation opens qualifications, credit and governance evidence; no combined risk score is manufactured.

Existing governed activation requirements remain in force. Supplier company activation still requires an accepted preferred remittance account. Current MESH bank verification is supplier-specific; the shared account tab explicitly explains that supplier acceptance does not authorize customer collections. No new collection-authorization workflow is introduced by this UI reorganization.

Validation: 43 targeted tests (21 UI, 22 server), UI/server type checks, live database-backed matrix and bank-reader checks, and complete production API/web image builds. Live reader checks verify SQL execution, denied-company redaction, selected-company filtering and explicit bank acceptance flags. The saved authenticated browser session is expired; signed-in browser verification is not claimed.

No SQL migration is required. DEV deployment and health evidence, image rollback references and logs are retained privately under `/home/chandravel_natarajan/.athyper/instances/dev/receipts/roles-workspace-20260909/`.
