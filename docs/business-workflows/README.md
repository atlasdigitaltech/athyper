# athyper Business Capabilities & Workflow Design

**Edition:** September 2026  
**Scope:** the seven attached NEON workspaces and all 32 catalogue modules  
**Audience:** tenant business owners, process designers and implementation teams

This series translates the workspace catalogue and inspected business foundations into business-facing process designs. Each workspace document includes its complete module inventory, responsible roles, required information, a primary workflow for every module, decision and exception paths, proposed communications, measures, Atlas AI boundaries and cross-workspace handoffs.

## Workspace documents

| Document                                    | Modules | Business focus                                                                                                             |
| ------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Finance](finance.md)                       | 7       | Establish controlled accounting, liabilities, collections, cash, budgets, tax and asset values.                            |
| [Supply Chain](supply-chain.md)             | 9       | Connect supplier eligibility, sourcing, purchasing, stock and delivery through accountable supply decisions.               |
| [Commercial](commercial.md)                 | 3       | Develop customer demand into accepted commercial terms, fulfilled orders and supported billing instructions.               |
| [People](people.md)                         | 5       | Coordinate employment, talent, attendance, payroll and external engagements while preserving person and access boundaries. |
| [Projects & Services](projects-services.md) | 3       | Connect project scope, delivery responsibilities, service acceptance and financial accountability.                         |
| [Operations](operations-management.md)      | 2       | Control the execution of production and maintenance with explicit material, asset and acceptance evidence.                 |
| [Assets & Facilities](assets-facilities.md) | 3       | Manage asset custody, site services and proposed property obligations with clear accounting and operational handoffs.      |

Every module name follows the current workspace catalogue. Some database reference seeds use older labels; those do not create additional modules. Shared Master Data Governance, STUDIO, MESH and platform services are dependencies in this series, not additional workspace deliverables.

## How to read capability status

| Evidence position                                    | Meaning                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source implementation present; activation unverified | A bounded service behavior was found in source. The module chapter states what it does and what remains unverified. This is not end-to-end completion. |
| Data foundation defined; workflow proposed           | Relevant domain records exist. The proposed orchestration, UI, approvals and deployment still require verification.                                    |
| Supporting foundation only; workflow proposed        | Related records or services exist, but they do not establish the module-specific workflow.                                                             |
| Available in a qualified deployment                  | Reserved for a named tenant/environment and current acceptance evidence. No module receives this designation in this review.                           |

All diagrams and step tables describe proposed business workflows. They are not literal lists of application statuses. A stored status value does not establish a permitted transition, approval rule, notification or automation. Proposed measures are reporting requirements, not claims of existing dashboards. Proposed Atlas use cases do not install tools or grant business authority.

## Cross-workspace journeys

| Journey                            | Coordinating owners                                       | What must remain distinct                                                                          |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Purchase to payment                | Supply Chain → Finance                                    | Demand approval, supply acceptance, invoice approval and bank execution.                           |
| Customer opportunity to collection | Commercial → Supply Chain / Projects & Services → Finance | Customer promise, fulfillment, billable acceptance, invoicing and collection.                      |
| People need to work and settlement | People → Projects & Services / Supply Chain → Finance     | Employment or engagement, placement/access, accepted time, pay or supplier charge, and settlement. |
| Asset acquisition to retirement    | Assets & Facilities → Operations → Finance                | Custody, serviceability, valuation and physical disposal.                                          |
| Plan to production and stock       | Supply Chain → Operations → Supply Chain → Finance        | Recommendation, production authorization, accepted output, stock movement and cost posting.        |

## Shared handoff register

The same IDs and acceptance boundaries appear in each relevant workspace document. They identify proposed business contracts. They do not establish working integrations.

| ID  | From and to                                          | Required evidence                                                       | Receiving responsibility                                          |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| H01 | Supplier Management → Procurement                    | Eligible supplier and permitted company/role scope                      | Buyer verifies current eligibility when ordering                  |
| H02 | Procurement → Accounts Payable                       | Order, accepted quantity/service and supplier charge reference          | Payables matches and approves the liability                       |
| H03 | Accounts Payable → Treasury                          | Approved due liability and proposed payment allocation                  | Treasury authorizes and executes payment                          |
| H04 | Treasury → Payables / Receivables                    | Confirmed execution or receipt with bank reference                      | Relevant account owner allocates and reconciles settlement        |
| H05 | Sales → Supply Chain                                 | Released order, quantity, destination and accepted terms                | Fulfillment owner admits and plans supply                         |
| H06 | Supply Chain → Sales                                 | Actual accepted fulfillment quantity and exception evidence             | Commercial owner determines accepted customer/billing basis       |
| H07 | Sales → Accounts Receivable                          | Accepted billable scope, customer, company, terms and evidence          | Billing owner validates customer invoice basis                    |
| H08 | Professional Services → Accounts Receivable          | Accepted deliverable or effort, contract basis and charge scope         | Billing owner validates billable event                            |
| H09 | Enterprise Asset Management → Fixed Asset Accounting | Acquisition, transfer or disposal evidence and asset identity           | Asset accountant determines book treatment                        |
| H10 | Assets / Facilities → Maintenance                    | Asset or site reference, fault/service need and operational constraints | Maintenance owner admits work and returns serviceability evidence |
| H11 | Payroll → Finance and Treasury                       | Approved pay result and authorized accounting/payment instructions      | Finance validates posting; Treasury authorizes settlement         |
| H12 | External Workforce → Procurement                     | Accepted engagement work with source identity and allocation            | Procurement creates or accepts the applicable service basis       |
| H13 | Project Management → People / External Workforce     | Approved resource need, duration, company and funding                   | People owner governs employment or engagement route               |
| H14 | Manufacturing → Inventory                            | Authorized component consumption and accepted production output         | Inventory admits movement and reconciles quantity/value           |
| H15 | Project Management → Finance                         | Approved budget scope and substantiated cost references                 | Budget/accounting owner admits financial transaction              |
| H16 | Demand & Supply Planning → Manufacturing             | Reviewed supply recommendation and assumptions                          | Production owner authorizes a production proposal                 |

## Working conventions

Each primary workflow identifies a trigger, accountable roles, inputs, actions, outputs and exceptions. The design preserves three distinctions: a proposal is not accepted state; a notification is not a decision; and a sender's completion is not the receiver's approval.

Tenant implementation workshops should resolve company and organization scope, reviewers, amount thresholds, deadlines, required documents, escalation and correction rules. These are explicit decisions rather than assumed defaults. Domain-specific obligations such as tax, payroll, safety or legal acceptance require their own qualified configuration and review.

## Delivery acceptance

The documents are ready for business design review. Production capability acceptance requires a demonstrated journey for the selected tenant and configuration, including authorization denial, return/rejection, stale changes, interruption/retry, evidence retrieval and reconciliation across the handoff. The module-specific gaps identify where implementation work must precede that acceptance.

## Internal evidence and related reading

The [internal evidence matrix](internal/evidence-matrix.md) records source mappings, representative constraints, bounded implementations and unresolved gaps for all 32 modules. Keep that technical appendix separate when sharing individual workspace documents externally.

The [athyper Robust Architecture whitepaper](../architecture/athyper-robust-architecture-whitepaper.md) explains the platform capabilities that support these processes. The [engineering architecture overview](../architecture/system-architecture-overview.md) describes their implementation boundaries.
