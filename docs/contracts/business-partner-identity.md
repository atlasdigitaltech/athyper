# Business Partner identity

NEON Business Partners are organizations. `master.business_partner.partner_category` defaults to `organization` and its domain rejects every other value. People, employees and external workers remain in the People/Workforce model; there is no Person-to-Business-Partner legacy-link table.

`master.business_partner.name` is the single required registered organization name (maximum 320 characters). Entity metadata labels it **Registered name** and drives required-field and length validation. Business Partner `legal_name` and `display_name` columns, intake inputs and response properties are removed. Record titles, list bindings, imports and canonical materializers use `name`.

Alternate names belong to `master.business_partner_alias`, with kind, language, country, validity dates and status. The `aliases` array remains a derived cache. Search-index text and duplicate checking include eligible aliases; history and aliases do not replace the registered name or grant eligibility.

Received MESH organization profiles retain their independently owned source schema. Explicitly accepting their `partner.legalName` maps to NEON `name`; profile amendments compare and update that same field. Contact-person display names and operating-organization labels belong to separate contracts.

Local activation uses the normal Studio signed preview publication and direct changes to the empty local identity schema. No migration file or historical conversion is required. The metadata preparation is `withBusinessPartnerOrganizationIdentity`; activation is `tooling/scripts/verification/activate-business-partner-organization-identity.mts`.
