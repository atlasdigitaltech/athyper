# Finance setup posting readiness design

`FIN_SETUP_READINESS` is an ad-hoc Finance governance cycle instantiated once
per company readiness attempt. Its entity code is the company code and its
final authority is the `FINANCE_POSTING_READY` certification.

## Phases and gate checks

| Phase | Required checks |
| --- | --- |
| ORGANIZATION | Company and legal entity active; functional/base currency configured |
| LEDGER | Primary ledger book assigned; fiscal calendar generated; current periods available |
| ACCOUNTING | Operating chart assigned; required GL controls complete; mandatory posting roles resolve to postable accounts |
| BANKING | House bank configured; company bank-account link active |
| TAX_AND_PAYMENT | Payment methods configured; tax groups and rates valid |
| OPENING_BALANCE | `OPEN_BAL_FINAL` attested; period 0 closed at fiscal and book level |
| POSTING_TEST | Current fiscal/book period open; controlled test journal posted and reversed with IDs in task evidence |
| CERTIFICATION | No unresolved critical readiness deviations; `FINANCE_POSTING_READY` certified/attested |

Every task dependency is a hard finish-to-start dependency. Exceptions,
overrides, and waivers use `governance.cycle_deviation`; none can bypass final
certification without the normal governance approval trail.

## Workbench readiness source

`GET /finance/setup/readiness` returns `governanceReadiness` from the latest
`FIN_SETUP_READINESS` run for the company. It includes the run, mandatory task
counts, unresolved critical deviation count, final certification status, and a
derived `certified` boolean. UI readiness must use this governed record for the
posting-ready state; client-side scenario/mock state is not authoritative.
