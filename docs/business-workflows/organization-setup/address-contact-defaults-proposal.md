# Addresses, contacts and default settings: business setup proposal

Version 1.2 · 16 September 2026 · For business owners and implementation workshops

This document explains which addresses, contact details and default settings to collect for your organization in athyper. A **default** is the usual choice suggested by the system—for example, the address normally printed on a company's invoice. It still needs to be suitable for the particular transaction.

athyper's current design includes records for addresses, communication details and named contacts. The implementation team must confirm which setup screens and processes are available in your environment. Items marked **proposed** require further setup or development; this document does not activate them.

Use the [Excel data collection workbook](neon-organization-setup-data-collection.xlsx) to record your decisions.

## 1. Where does the information belong?

| Business level | What it represents | Typical information to maintain |
| --- | --- | --- |
| Tenant | Your enterprise's application workspace, which may include several legal entities | General business address, central support contact, preferred language, time zone and branding |
| Legal entity | A legally recognized organization | Official registered office, legal correspondence address, legal and tax contacts, official identity and currencies |
| Company code | An accounting unit belonging to one legal entity | Invoice addresses, payment correspondence address, finance contacts and accounting settings |
| Operating organization | A team or unit coordinating activities such as purchasing or sales, possibly for several companies | Operational office, purchasing or sales contacts, usual transaction currency and participating companies |

The same physical address can serve several business purposes. For example, one office may be the legal entity's correspondence address and the company code's invoice address. Record the location once, then state separately which organization uses it and for what purpose.

Sharing an office does not transfer legal responsibility, accounting responsibility or a person's authority to approve transactions.

## 2. The five types of information to collect

| Information | What it means | Example |
| --- | --- | --- |
| Address details | The physical or postal location | Building, street, city, postcode and country |
| Address use | Which organization uses that location, why, and during which period | Company MY01 uses this office as its invoice-issuing address from 1 October |
| Organization contact details | A business email, telephone number, website or other communication method | A shared Finance mailbox or purchasing office telephone |
| Named contact | A particular person, their title and department | A finance officer in Accounts Payable |
| Contact responsibility | The business function the person performs | Supplier payment enquiries, purchasing, sales, legal or tax |

A shared mailbox such as `finance@example.com` can belong directly to the company. You do not need to create an imaginary person for it. A named contact can have their own business email and phone details. Record an office address against the organization; use an “Attention to” line when correspondence should reach a particular person or department.

### What does “primary” mean?

Primary means the usual first choice **for a particular purpose**. It does not mean the only address or contact the organization may have.

- **Primary correspondence address:** the usual address for letters to that organization.
- **Primary named contact:** the organization's main general contact person.
- **Primary responsibility of a person:** that person's main business function.
- **Primary email or phone:** the preferred communication detail for the specified purpose.

A person's main responsibility may be Accounts Payable without making them the designated Accounts Payable contact for every company. That company-level responsibility must be agreed separately.

## 3. Address and contact purposes

The purposes below are included in the current standard setup. Business labels are used here; the implementation team will match them to the system's available choices.

| Business level | Address purposes included | Contact purposes included |
| --- | --- | --- |
| Tenant | General address, correspondence, invoice issuing, invoice receiving, dispatch, delivery, place of service and payment correspondence | General contact, correspondence, notifications and support |
| Legal entity, company code and operating organization | General address, correspondence, invoice issuing, invoice receiving, dispatch, delivery and payment correspondence | General contact, correspondence and notifications |
| Named person | Use the organization's office address where appropriate | General contact, business communication, notifications and escalation |

**Proposed additions:** clearly labelled **Registered office** for legal entities, **Headquarters** where the business needs that distinction, and **Support contact** for the other organization levels that need it. These choices require confirmation and configuration before use.

A general address should not be assumed to be the registered office. Ask the responsible business owner to confirm the official address and provide the supporting reference.

Contact responsibilities already include Purchasing, Sales, Finance, Accounts Payable, Accounts Receivable, Legal, Tax, Logistics, Support and Escalation. A person's responsibility and the purpose of their email are different: a person may handle Accounts Payable and use a business email address for that work.

## 4. How to complete the workbook

| Workbook sheet | Complete one row for | Details to collect |
| --- | --- | --- |
| Addresses | Each physical or postal address | Address reference, country, address type, street or address lines, building/unit, city, region, postcode and relevant delivery details |
| Address Usages | Each organization and purpose using an address | Organization name/code, address reference, purpose, attention line, whether it is primary, start/end dates and reviewer |
| Contacts | Each named contact belonging to an organization | Contact reference, organization, name, title, department, whether they are the main contact and reviewer |
| Contact Roles | Each responsibility assigned to a person | Contact reference, responsibility, whether it is their main responsibility and applicable dates |
| Contact Channels | Each email, phone or other communication detail | Organization or person, communication method, actual email/number/website, purpose, whether it is preferred, and when it can be used |
| Master Defaults | Each proposed usual setting | Relevant organization, setting, proposed choice, whether another level's choice may be used, whether users may change it, responsible owner and approval |

“Owner” in the workbook means the organization or person the information belongs to. “Channel” means a communication method, such as email or phone. “Inheritance” means using a setting from another agreed level when no local choice is provided. “Override” means permission to replace the usual choice for a particular situation.

Use simple collection references such as **ADDR001** and **CONTACT001** to connect the sheets. The implementation team will match these references to the system records. Enter an address once even if several companies use it; add a separate Address Usages row for each company and purpose.

### Address quality and dates

Collect enough detail for actual delivery, including the fields needed in the relevant country. A country name alone is not a usable delivery address. Include the box number for a PO-box address. If geographical coordinates are needed, provide both latitude and longitude.

Use dates such as **2026-10-01** for address use and contact responsibilities. For communication details, the workbook also asks for time and time zone—for example, **2026-10-01T09:00:00+08:00**, meaning 9 a.m. on 1 October in a time zone eight hours ahead of UTC.

Under the proposed usage rules, an end date is the first date the information should no longer be used. For example, an address use ending on **2027-01-01** is available through 31 December 2026. Leave the end blank when no end is planned. Confirm the applicable date rules separately for financial settings.

Collect evidence for verification, but do not mark an address or contact as verified merely because it was entered into the workbook. Selecting a primary address or contact does not approve its use or grant authority to the person.

## 5. Which default settings should the business agree?

The following settings are represented in the current design. Their use in a particular screen or process still needs implementation confirmation. Choose values for your business rather than applying the same choices to every organization.

### Tenant: enterprise-wide preferences

| Setting | Business decision | Responsible owner |
| --- | --- | --- |
| Country, language, time zone and regional display preferences | What should users normally see when no more specific approved preference applies? | Business administrator |
| Available languages and preferred language | Which supported languages should be enabled? English remains enabled and is the fallback language. | Business administrator |
| Date and number formats | How should dates, decimal numbers and separators be displayed? | Business administrator with Finance |
| Start of week and weekend days | What should the general calendar display use? These preferences do not define payroll or statutory working calendars. | Business administrator with HR |
| Display name and logo | Which enterprise branding should appear? | Corporate administration |
| General address and contact details | Which address, email, telephone and support contact should represent the enterprise workspace? | Corporate administration / Support |

### Legal entity: official information

| Setting | Business decision | Responsible owner |
| --- | --- | --- |
| Official name and registration details | What are the approved legal identity and registration country? | Corporate administration / Legal |
| Registered office | Which address is the official registered office? The specific Registered office purpose is a proposed addition. | Corporate administration / Legal |
| Correspondence address and legal/tax contacts | Where should legal correspondence go, and who handles legal or tax enquiries? | Legal / Tax |
| Accounting and reporting currencies | Which currency reflects the entity's primary business activity, and which is nominated for reporting? | Finance |
| Tax registrations | Which registration applies to the relevant jurisdiction, registration type, company and period? | Tax / Finance |
| Display name and logo | Does this entity need its own approved presentation? | Corporate administration |

Legal identity, registered office and accounting currency must be confirmed for that entity. They should not silently be taken from the tenant or another legal entity.

### Company code: accounting and financial operations

| Setting | Business decision | Responsible owner |
| --- | --- | --- |
| Accounting currency and financial-year start | Which currency and starting month apply to this accounting unit? | Finance controller |
| Country, time zone and regional preferences | Should the company use the enterprise preferences or an explicitly agreed local choice? | Finance / Business administrator |
| Invoice and payment correspondence addresses | Which addresses should be used when issuing invoices, receiving invoices and handling payment correspondence? | Finance |
| Finance contacts | Who handles payables, receivables and general finance enquiries? | Finance |
| Chart of accounts and accounting books | Which account structure and reporting books apply? | Finance controller |
| Reporting categories | Which additional accounting categories should normally be suggested, which are mandatory, and may users change them? | Finance controller |
| Account-specific cost center or site | Which suggestions and required accounting details apply to a particular general ledger account? | Finance controller |
| Banking preferences | Which eligible bank relationships are normally used for payments and collections? A preference does not authorize a payment. | Treasury |

A company can use the same location as its legal entity, but its use for invoice or payment correspondence should be explicitly agreed. Creating these settings alone does not make the company ready to post accounts or execute payments.

### Supplier or customer within a company: agreed commercial terms

| Relationship | Settings to agree | Important distinction |
| --- | --- | --- |
| Supplier serving a company | Transaction currency, payment terms, accounting treatment, preferred remittance bank relationship and reporting categories | These terms belong to that supplier's relationship with the company. They are not automatically the terms for every supplier. |
| Customer buying from a company | Transaction currency, payment terms, accounting treatment, reporting categories and statement frequency | Preserve the customer's agreed terms. A general company preference should not overwrite them. |

Finance and the responsible commercial owner should approve these choices together. Accounting currency and transaction currency serve different purposes and need not be the same.

### Operating organization: purchasing and sales coordination

| Setting | Business decision | Responsible owner |
| --- | --- | --- |
| Office and operational contacts | Which office, correspondence details and named contacts support the work? | Operations owner |
| Purchasing arrangement | Who negotiates, who places orders, and how are responsibilities shared between central and local teams? | Procurement |
| Usual purchasing currency and lead company | Which choices should normally be suggested where applicable? | Procurement with Finance |
| Sales arrangement | Who coordinates selling and who retains company responsibility? | Sales |
| Usual sales currency, booking company and invoicing company | Which company normally records the sale, and which issues the invoice? | Sales with Finance |

A company chosen as a purchasing or sales default must already be an active participant in that operating organization, with membership effective when the settings are saved. A future membership date alone does not meet this requirement.

Other enterprise application settings should be agreed with the platform administrator through the supported administration process.

## 6. Additional defaults proposed for business review

These requirements need further design or confirmation in the relevant business process. They should not be assumed to be available as organization-level settings today.

| Proposed setting | Where it should apply | Decision needed |
| --- | --- | --- |
| Starting payment terms and accounting treatment for new suppliers/customers | Company, separately for purchasing and sales relationships | Should onboarding suggest company-approved starting values while preserving subsequently negotiated terms? |
| Usual delivery location or warehouse | Operating organization, participating company and transaction type | Which locations are eligible for this company and activity? Avoid one delivery address for every participating company. |
| Delivery terms, shipping method and document language | Purchasing/sales process and relevant contract or partner | Which existing process settings can supply these choices, and where are additions needed? |
| Exchange-rate source, payment method, rounding and permitted differences | Finance and payment processes | Which approved financial policy applies? |
| Document numbering, templates, approval routes and reminders | Relevant document, company and process | Who owns these choices, and how will the process apply them? |
| Alternative contact or address when the usual choice is unavailable | Specific communication or document process | Is an alternative allowed, which one, and when must the user resolve missing information? |

## 7. Proposed rules for using defaults

The appropriate starting point depends on the information being selected. There is no single rule that every operating organization should simply take all settings from a company, legal entity or tenant.

1. **Display preferences:** use the permitted user or company choice, then the enterprise preference, then the application's standard preference. Confirm which screens support this order.
2. **Legal details:** use the selected legal entity's approved information. If its registered office is missing, request completion rather than substitute another organization's office.
3. **Document addresses:** use an approved address selected for the document; otherwise use the company's current primary address for that purpose. Confirm delivery locations against the actual delivery requirement.
4. **Commercial terms:** respect approved contract or transaction rules and the supplier/customer's agreed company-specific terms. Use general starting values only where the process explicitly allows them.
5. **Contacts:** use the approved recipient or the designated contact for the relevant organization and responsibility. Ask for a decision if two contacts appear equally applicable.
6. **Availability:** check permission to use the information and its validity dates. Do not get around a blocked address by choosing an alternative without approval.
7. **History:** show where the suggested value came from. Allow changes only where permitted and retain the appropriate historical information on accepted documents. Changing a master address should not silently change an invoice already issued.

These are proposed operating rules that require implementation and business acceptance.

## 8. Improvements recommended before rollout

| Priority | Business improvement | Why it matters |
| --- | --- | --- |
| Essential | Include addresses, address purposes, people and communication details in organization setup | Users need a complete collection and maintenance process. |
| Essential | Add clearly labelled Registered office and other agreed purpose choices | General and official addresses must be distinguishable. |
| Essential | Check address completeness for the relevant country | Information can be stored without being sufficient for actual delivery. |
| Essential | Prevent competing primary emails or phone numbers for the same purpose during overlapping periods | Current checks do not cover every situation involving records with end dates. Users need an unambiguous usual contact. |
| Next stage | Agree one designated contact per company and responsibility where required | A person's main responsibility does not establish who should receive all company enquiries of that kind. |
| Next stage | Introduce company starting terms for new partners if required | Make onboarding easier while preserving approved supplier/customer agreements. |
| Next stage | Demonstrate that documents and communications use the intended defaults | Maintaining a preferred address or contact does not by itself prove every business process will use it. |

When replacing an address, review the earlier use, its dates and any restriction before introducing the replacement. Where several organizations share a location, use the approved correction or relocation process so that the effect on each organization is understood.

## 9. Worked example

Northstar Malaysia and its accounting unit MY01 use the same office.

| Workbook entry | Business meaning |
| --- | --- |
| Address ADDR001 | Record the office's full postal details once. |
| Address use for Northstar Malaysia | Approve ADDR001 for legal-entity correspondence. Confirm the registered-office purpose separately when configured. |
| Address use for MY01 | Approve ADDR001 as the invoice-issuing address for this accounting unit. |
| Organization email for MY01 | Record the shared Finance mailbox as the usual finance correspondence email. |
| Named contact CONTACT001 | Record the finance officer's name, title and department. |
| Responsibility for CONTACT001 | Assign Accounts Payable for the agreed period. |
| Personal business email for CONTACT001 | Record the officer's business email separately from the shared Finance mailbox. |
| Company settings for MY01 | Finance confirms accounting currency, financial-year start and applicable accounting arrangements. |

These are fictional examples for collection workshops. Each primary choice and business purpose still needs the responsible owner's review.

## 10. Business sign-off

Corporate Administration and Legal confirm official identity and addresses. Finance confirms accounting settings and finance contacts. Treasury confirms banking preferences. Procurement and Sales confirm their operational responsibilities and default companies. The business administrator confirms presentation preferences.

Record the approved choices, any permitted alternatives, the responsible owner, applicable dates and supporting evidence in the workbook. Treat missing registered-office choices, conflicting primary contacts and unconfirmed default behavior as open setup decisions before launch.

Engineering details are retained separately in the [implementation reference](internal/address-contact-defaults-technical-review.md). This revision changes the business documentation only.
