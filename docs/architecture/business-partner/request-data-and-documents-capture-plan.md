# Business Partner request: data and supporting-document capture

Status: proposed design. Scope: internal request form only.

## 1. Merged recommendation and scope

Extend the existing repeatable request sections with a shared Supporting documents component, and add a repeatable Bank accounts section. Internal users enter, save, reopen, edit and submit the data as part of the request.

This plan combines the section-level attachment proposal with the compact bank-entry proposal. It supersedes their broader workflow recommendations for this implementation scope. It does not implement collaboration, invitations, self-registration, document review/acceptance, bank verification, master-record materialization, company acceptance, payment setup, or later lifecycle gates. Submission saves the request and its document references only; it confers no verification or operational eligibility.

## 2. Sections and attachment targets

Preserve existing metadata-defined data fields in the five existing sections. Add Supporting documents inside each entry, and add the bank collection using the same interaction pattern.

| Section | Data captured | Supporting-document examples | Attachment target |
| --- | --- | --- | --- |
| Business registration identifiers | Scheme, issuing country, registration number and applicable dates | CR Card, registration certificate, registry extract | Specific identifier entry |
| Tax registrations | Tax scheme, jurisdiction, number and applicable dates | Tax Card, VAT certificate, exemption evidence | Specific tax entry |
| Commodity and industry classifications | Classification scheme/code and existing capability details | Brochure, product specification | Specific classification/capability entry |
| Governance and ownership | Existing member, relationship or ownership details | Ownership chart, shareholder register, authorization | Specific governance/ownership entry |
| Certifications | Certification type, issuer, number, scope and applicable dates | Certificate, annex, renewal | Specific certification entry |
| Bank accounts | Account identity, routing details and optional intended use | Bank confirmation, account/IBAN certificate | Specific bank entry |

A company profile that applies to the whole partner may be attached at request level. It satisfies a row-level requirement only when explicitly linked to that entry and allowed by its document-type rule. Support multiple files per entry and explicit reuse of an authorized attachment without duplicating the stored file.

## 3. Bank entry design

Default: no bank entry is required unless request policy requires one. Once the user adds an entry, validate its applicable fields on submission. Incomplete entries may be saved in drafts.

| Field | Capture behaviour |
| --- | --- |
| Account holder name | Required for an added account. Explicit “Use registered name” copies the current value; subsequent name edits do not silently overwrite it. |
| Bank country | Required searchable reference. Controls applicable identifier/routing fields. |
| Bank name | Required. Use a bank reference when available; permit structured manual entry only where metadata allows it. |
| IBAN / Account number | Require the applicable identifier according to configured country/scheme rules. Do not universally require both. Preserve as strings, including leading zeros. |
| SWIFT/BIC / Local routing code | Show and require according to configured country/scheme rules; use scheme-specific labels. |
| Branch | Optional unless an applicable rule requires it. |
| Account currency | Optional unless configured otherwise; searchable currency reference. |
| Intended use | Optional metadata choice, with role-appropriate options. Records intent only. |
| Company scope | Inherit request scope when unambiguous; otherwise allow authorized selection if this field is configured. Records intended scope only. |
| Supporting documents | Multiple documents; required types controlled separately from account requiredness. |
| Notes | Optional. |

Show holder, country, bank and account identifier first. Place conditional routing fields underneath, then Supporting documents. Keep optional additional details collapsible, but automatically expand them when they contain errors. Display multiple accounts as compact summaries with Edit and Remove actions. Mask account identifiers in collapsed summaries and the review step.

Changing bank country or scheme recalculates fields and errors. Preserve entered data for correction; do not silently clear values or submit now-inapplicable hidden values. Ask the user to resolve incompatible captured values before submission. Do not infer a payment scheme from country alone when more than one scheme is supported.

## 4. Shared Supporting documents component

Each entry displays configured document requirements, Add document and Select existing document actions, followed by attached-file rows. Each file row includes file name, document type, upload state, optional reference/issue/expiry metadata, and permitted preview/download/remove actions.

Use capture states only: Missing, Uploading, Processing, Attached and Upload failed. “Attached” means an upload is available under the existing attachment service's checks; it does not mean reviewed or verified. Surface date validation as a specific error where configured. Do not introduce Accepted, Rejected or Awaiting review workflow states.

Assign a stable entry key before uploading. Associate files with request ID, section code and entry key, never the visible array index. Reordering, saving or reopening must preserve links. Removing an entry removes its request associations; it must not delete a file reused elsewhere. Replacement updates the selected version for that draft association. Submission records the exact attachment version references.

Reuse the existing attachment service and attachment/link storage where supported. Confirm support for draft request-entry targets before implementation; extend that association contract if necessary. Do not assume an unsaved bank entry can be linked as an existing master bank-account row.

## 5. Metadata-driven capture policy

Publish a typed request-capture contract for section visibility/order, field labels/help, reference sources, conditional fields, validation, document types, file limits, confidentiality and localized messages. Extend UI and API consumers together. The following are proposed capabilities, not claims that the existing contract already supports every property.

Evaluate applicability using tenant, requested onboarding role, request organization/company, relevant country and applicable classification. Distinguish registration country, tax jurisdiction and bank country explicitly.

Keep these independent:

1. **Entry requirement:** minimum qualifying entries for a section or scheme.
2. **Field requirement:** required values and formats within an added entry.
3. **Document requirement:** minimum files and acceptable document types for the relevant entry.

Document requirements may specify all listed types or any acceptable alternative, and whether they apply to each entry or at least one qualifying entry. An empty collection cannot satisfy a minimum-entry requirement. Resolve matching mandatory requirements together; an optional customer rule cannot cancel a supplier requirement for a supplier request. Reject contradictory policy configuration during publication.

For this scope, enforcement moments are only **Save draft** and **Submit request**. Drafts permit incomplete business fields and documents while enforcing authorization, safe file handling and payload limits. Submission enforces applicable completeness, format and attachment requirements on the server. Uploads that are pending or failed do not satisfy a required-document rule.

Example tenant configurations, not country-wide legal requirements:

| Configuration | Submission requirement |
| --- | --- |
| Tenant A, supplier, registration country Qatar | Commercial registration entry with CR Card; applicable tax entry with Tax Card |
| Tenant B, supplier, registration country Saudi Arabia | Commercial registration entry with CR Card; applicable VAT entry with VAT certificate |
| Either tenant, customer | Optional unless a customer-specific rule requires them |
| Bank capture prototype | Optional account collection; complete applicable fields for each added account; evidence optional unless configured |

## 6. Request persistence and validation

Persist all collections and document associations with the existing request draft, including proposed bank entries. Keep sensitive account identifiers and documents under the platform's protected-data and attachment access controls. Do not put raw account values in logs, analytics, URL parameters or unprotected browser persistence.

Persist the form/contract version with the request. On submission, verify the expected contract and return an explicit refresh/revalidation response if policy has changed; preserve the draft. Return field errors using section and stable entry keys. Display them under the affected field/document area, with a top-level error summary linking to each entry.

The review step shows section summaries, masked bank details, attachment names/types and capture completeness. The API verifies attachment ownership/access, entry association, document type and usable upload state independently of browser assertions. Saving the request must not create or update operational bank records.

## 7. Implementation sequence and acceptance

1. Confirm existing request-extension, protected-data and attachment APIs; map each section to stable entry keys and identify any draft association gap.
2. Extend and publish the Meta Entity request contract and submission-validation contract.
3. Add the reusable Supporting documents component to the five existing sections.
4. Add the repeatable Bank accounts section, conditional references/fields and protected draft persistence.
5. Integrate draft restoration, review summaries and server submission validation.
6. Verify the following acceptance scenarios before activation:

- All six sections retain their data and document links after save/reopen and row reorder.
- Two bank entries keep separate supporting documents; removing one preserves the other.
- Draft saving succeeds with missing required business data; submission returns precise linked errors.
- Supplier/customer and country-specific examples resolve independently and identically in UI/API.
- Missing registrations cannot pass through an “every entry has a document” rule.
- Failed/pending uploads and inaccessible or unrelated attachment references cannot satisfy requirements.
- Country changes preserve editable data and flag incompatible identifiers.
- Bank values stay masked outside authorized editing and are absent from diagnostic logs.
- Successful request capture produces no operational bank-account, verification, acceptance or payment changes.

Documentation only: no runtime, schema or publication changes are made by this plan.
