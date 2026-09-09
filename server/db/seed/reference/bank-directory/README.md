# Verified multicountry development input

Load `development.v1.json` into Studio **MDG → Bank directory → Import and validate**. The file is normalized input to the governed importer, not an already approved release. An independent reviewer approves it; normal signed publication installs the same directory hash in every plane.

The fixture includes three institution references and three institution-level BICs. It contains no accounts and does not invent physical branches or national clearing identifiers. Institution labels follow the cited bank pages; they are display values, not legal-entity matching keys.

| Country | Institution label | BIC | Official evidence |
| --- | --- | --- | --- |
| SG | DBS Bank | DBSSSGSG | [DBS incoming-transfer guidance](https://www.dbs.com.sg/personal/support/bank-general-swift-code-details.html) |
| MY | Maybank | MBBEMYKL | [Maybank foreign telegraphic transfers](https://www.maybank2u.com.my/maybank2u/malaysia/en/business/services/foreign-telegraphic-transfer.page) |
| GB | HSBC Bank plc | MIDLGB22 | [HSBC payment instructions, page 13](https://www.business.hsbc.uk/-/media/media/uk/pdfs/regulations/guide-to-payment-instructions-dec25.pdf) |

Observed 9 September 2026 in Malaysia (8 September UTC). The effective start is the observation date in UTC, not a claim about when a bank was founded or first received its BIC. HSBC Bank plc and HSBC UK Bank plc are different entities; this fixture uses the former as explicitly listed in the source.

This small development input is not a licensed global directory. Obtaining global feeds, redistribution rights, provider-specific parsers and authoritative physical-branch coverage remains a separate data-supply task. The importer accepts normalized, provenance-bearing JSON batches; it does not scrape arbitrary source URLs.
