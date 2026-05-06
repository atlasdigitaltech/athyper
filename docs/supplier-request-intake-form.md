# Supplier Request Intake Form

## Purpose

Design a comprehensive supplier intake that starts from a request form, creates the core `master.supplier` record, and captures the related onboarding data needed for procurement, tax, compliance, contacts, banking, and governance review.

The current generic `/app/[entity]/new` path can create one entity at a time. A full supplier intake therefore needs a composite submit path that can persist a parent supplier plus related child/link records in one transaction, or a staged rollout where `/app/supplier/new` creates the supplier and the Supplier 360 child tabs collect the remaining records after create.

## Form Shape

Use a stepper, not one long page. The intake is dense and has restricted data, so each step should be scannable, with repeatable grids for child rows.

| Step | Purpose | Tables |
| --- | --- | --- |
| Identity | Supplier legal/business identity and primary external IDs | `master.supplier`, `master.party_identifier` |
| Geographic Coverage | Where the supplier can ship, serve, or operate | `master.party_service_coverage` with `party_type='business_partner'` |
| Tax & Compliance | Jurisdictional tax profile and onboarding/KYC state | `master.party_tax_profile`, `master.supplier_qualification` |
| Contacts | Named supplier contacts only; channels stay in contact link tables | `master.party_contact_person` |
| Banking | Remittance accounts captured through write tables | `master.bank_account`, `master.bank_account_link`, viewed by `master.v_business_partner_bank_account` |
| Governance | UBOs, directors, shareholders, signatories | `master.party_governance_relation` |
| Review | Completeness, restricted-data warning, duplicate checks, submit | all above |

## Step Details

### 1. Identity

Primary supplier fields:

`code`, `name`, `display_name`, `legal_name`, `supplier_type`, `legal_form`, `status`, `tax_number`, `description`, `website_url`, `registration_no`, `registration_country_code`, `external_ref`.

Identifier repeater:

`scheme`, `value`, `issuing_authority`, `issued_at`, `valid_until`, `is_verified`, `is_primary`, `status`.

Behavior:

- Require `code`, `name`, and `status`.
- Default the first identifier to `is_primary=true`.
- Use `registration_country_code` as a country picker.
- Run duplicate hints on `name`, `legal_name`, `registration_no`, `tax_number`, and identifier values before submit.

### 2. Geographic Coverage

Coverage repeater fields:

`coverage_level`, `coverage_type`, `continent_code`, `country_code`, `region_name`, `city_name`, `notes`, `status`.

Behavior:

- Require `coverage_level`, `coverage_type`, and `status`.
- Encourage one default country-level row, then allow region/city refinement.
- Validate that narrower rows have their parent geography filled where possible.

### 3. Tax & Compliance

Tax profile repeater fields:

`country_code`, `tax_classification`, `taxation_type`, `tax_number`, `state_tax_number`, `sales_tax_number`, `service_tax_number`, `regional_tax_number`, `vat_number`, `is_vat_registered`, `has_tax_clearance`, `tax_clearance_number`, `tax_clearance_expiry_date`, `global_location_number`, `status`.

Qualification singleton fields:

`onboarding_status`, `profile_completeness_pct`, `is_approved_supplier`, `is_preferred_supplier`, `is_blocked`, `block_reason`, `risk_tier`, `sanctions_status`, `aml_kyc_status`, `delivery_score`, `quality_score`, `sla_score`, `last_review_date`, `next_review_date`, `status`.

Behavior:

- Require tax `country_code`, `is_vat_registered`, `has_tax_clearance`, and `status`.
- Show `vat_number` when VAT registered.
- Show clearance number and expiry when tax clearance is present.
- Default qualification to `onboarding_status=pending`, `is_approved_supplier=false`, `is_preferred_supplier=false`, `is_blocked=false`, `sanctions_status=not_checked`, `aml_kyc_status=not_started`, `risk_tier=low`, `status=active`.
- Keep `profile_completeness_pct` system-derived.

### 4. Contacts

Contact repeater fields:

`contact_name`, `business_title`, `is_primary`, `status`.

Behavior:

- Require `contact_name`, `is_primary`, and `status`.
- Default the first contact to primary.
- Do not inline email, phone, fax, or address fields; capture those through the contact/address link tables after the contact person exists, or in a dedicated nested channel subform if composite persistence is extended.

### 5. Banking

Display and review fields:

`bank_name`, `account_number`, `currency_code`, `account_holder_name`, `account_id_type`, `account_nature`, `is_verified`, `purpose`, `is_primary`, `effective_from`, `effective_until`, `bic_override`.

Persistence:

- Read from `master.v_business_partner_bank_account`; `master.v_supplier_bank_account` is only a temporary compatibility view.
- Write by creating `master.bank_account`, then `master.bank_account_link` with `owner_type='business_partner'`, `owner_id=<business_partner_id>`, purpose/default flags, and effective dates.

Behavior:

- Make banking optional at first intake unless payment-ready onboarding is required.
- Require account number and currency when a bank account row is added.
- Default `is_verified=false`; verification is a finance/compliance action.

### 6. Governance

Governance repeater fields:

`relation_type`, `member_name`, `member_type`, `company_name`, `business_title`, `ownership_pct`, `share_class`, `appointed_date`, `end_of_term`, `notes`, `status`.

Behavior:

- Require `relation_type`, `member_name`, `member_type`, and `status`.
- Show `ownership_pct` prominently for shareholder/UBO roles.
- Allow this step to be deferred for low-risk suppliers, but make it required for high-risk or regulated suppliers.

## Composite Submit Contract

Recommended payload:

```json
{
  "supplier": {},
  "identifiers": [],
  "service_coverage": [],
  "tax_profiles": [],
  "qualification": {},
  "contacts": [],
  "bank_accounts": [],
  "governance": []
}
```

Recommended transaction order:

1. Insert `master.business_partner`; capture `business_partner_id`.
2. Insert `master.supplier`; capture `supplier_id`.
3. Insert `party_identifier` rows with `owner_type='business_partner'`, `owner_id=business_partner_id`.
4. Insert `party_service_coverage` rows with `party_type='business_partner'`, `party_id=business_partner_id`.
5. Insert `party_tax_profile` rows with `owner_type='business_partner'`, `owner_id=business_partner_id`.
6. Insert `supplier_qualification` singleton with `supplier_id`.
7. Insert `party_contact_person` rows with `party_type='business_partner'`, `party_id=business_partner_id`.
8. Insert `certification` rows with `owner_type='business_partner'`, `owner_id=business_partner_id` when included.
9. Insert governance rows with `party_type='business_partner'`, `party_id=business_partner_id`.
10. For each bank account, insert `bank_account`, then `bank_account_link` with BP ownership.

All rows should share the resolved tenant, creator, and request correlation id. If any restricted section fails validation, the whole transaction should roll back.

## Security

- Treat tax profiles and governance as restricted/PII-bearing sections.
- Banking should be editable only by users with BP/supplier banking permission; the `business_partner_bank_account` entity remains read-only because it is a view.
- Mask account numbers after entry except for the last few digits.
- Record section-level audit events for tax, governance, and banking changes.

## Runtime Recommendation

Short term:

- Keep `supplier` as the primary create entity and allow child rows from Supplier 360 tabs after the supplier exists.
- Add a supplier create flow for the core identity fields if a guided stepper is needed immediately.

Target:

- Add a composite supplier intake endpoint or runtime adapter, for example `POST /api/records/supplier/intake`.
- Let `/app/supplier/new` dispatch to that adapter when the supplier flow declares `config.persistence='composite_supplier_intake'`.
- Keep field definitions in entity metadata, but allow flow sections to bind child entity fields through section-level `entity_code` metadata.
