# P2P Site and Address Defaulting

## Scope

This contract covers tenant, legal entity, company code, site, and address
defaulting for the purchasing document family:

| Business document | Header entity | Line entity |
| --- | --- | --- |
| Purchase Order | `document.commitment` | `document.commitment_line` |
| Goods Receipt | `document.goods_receipt` | `document.goods_receipt_line` |
| Service Entry Sheet | `document.service_entry_sheet` | `document.service_entry_sheet_line` |
| Purchase Invoice | `document.purchase_invoice` | `document.purchase_invoice_line` |

Address roles use the `master.address_purpose` vocabulary on direct document
header and line fields:

`default`, `ship_to`, `bill_to`, `ship_from`, `bill_from`, `remit_to`,
`place_of_service`, `correspondence`.

For organization/root party address owners, keep the master link purpose simple:

| Owner type | Allowed `master.address_link.purpose` |
| --- | --- |
| `tenant` | `default` only |
| `legal_entity` | `default` only |
| `company_code` | `default` only |
| `site` | `default` only |
| `business_partner` | `default` only |

Do not seed `bill_to`, `ship_to`, `place_of_service`, `bill_from`,
`remit_to`, `ship_from`, or `correspondence` as link purposes for these owner
types. Those names are document or role-owner roles. The role-specific meaning
belongs on direct document header fields, line fields, or role owners such as
`supplier` and `customer`.

Contact links follow the same root-owner simplification:

| Owner type | Allowed `master.contact_link.purpose` |
| --- | --- |
| `tenant` | `default` only |
| `legal_entity` | `default` only |
| `company_code` | `default` only |
| `site` | `default` only |
| `business_partner` | `default` only |

For these owner types, `master.contact_link.role_qualifier` must be `NULL`.
Role-specific contact routing belongs on role owners such as `supplier`,
`customer`, `business_partner_contact_person`, or direct document fields. Auth
contact purposes remain reserved for identity owners such as `principal` and
`employee`.

Demo seed policy:

- `athyper` and `technostat` follow the default-only master-address model for
  `tenant`, `legal_entity`, `company_code`, and `site`.
- In Athyper full-reset seeds, site default links are created by
  `tenants/neon/010_demo/100_org_structure/306_address_contacts.sql`, after
  `303_sites.sql`, so every active site gets one `master.address_link` with
  `owner_type = 'site'` and `purpose = 'default'`, using its company-code
  default address.
- `cirrusatlantic` is an explicit demo exception used to exercise role-specific
  address behavior. It does not seed `default` for those organization owners;
  instead it seeds Innovative Data floor addresses for `bill_to`, `ship_to`,
  `place_of_service`, and `correspondence`.
- The CirrusAtlantic address exception does not apply to contact links; tenant,
  legal entity, company code, site, and business partner contact links remain
  `default` only.
- `business_partner` is not part of the CirrusAtlantic exception. Across all
  demo tenants, each BP root should have one canonical `default` address link;
  supplier/customer operational addresses belong on `supplier` or `customer`
  owner links.

## Data Ownership

Tenant and legal entity are upstream organizational context. Company code is
the concrete financial scope used by purchasing documents.

`site_id` must always belong to the selected `company_code_id`. UI pickers must
filter sites by `company_code_id`; database and service validation must reject a
site from a different company code.

Bill-side and remit-side identity addresses are header-scope document fields
resolved through live master address joins. Do not reintroduce document-side
identity persistence tables for this model.

PI ship-side defaults are persisted on the PI header:

- `default_shipto_address_id`
- `default_shipfrom_address_id`
- `shipto_tax_jurisdiction_id`
- `shipfrom_tax_jurisdiction_id`

PI line ship-side overrides are persisted on the line:

- `shipto_address_id`
- `shipfrom_address_id`
- `shipto_tax_jurisdiction_id`
- `shipfrom_tax_jurisdiction_id`

## Header Rules

For documents created from a purchase order or commitment:

| Field | Default | UI behavior |
| --- | --- | --- |
| `company_code_id` | Copy from referenced commitment | Hidden or read-only |
| `supplier_id` | Copy from referenced commitment procurement row | Hidden or read-only |
| `commitment_id` | Referenced commitment id | Read-only after source selection |
| `site_id` | Copy from referenced commitment when present | Editable only if business flow allows override |

For documents created without a reference:

| Field | Default | UI behavior |
| --- | --- | --- |
| `company_code_id` | User selected working company code | Required |
| `supplier_id` | User selected supplier | Required where the document type needs supplier |
| `commitment_id` | `NULL` | Hidden unless source type requires PO/contract |
| `site_id` | Optional user selection | Picker filtered by `company_code_id` |

Header address defaults without a reference:

| Role | Owner walk | Purpose chain |
| --- | --- | --- |
| `bill_to` | `company_code` | `default` |
| `bill_from` | supplier role, then underlying `business_partner` | supplier: `bill_from`, `bill_to`, `default`; BP: `default` |
| `remit_to` | supplier role, then underlying `business_partner` | supplier: `remit_to`, `default`; BP: `default` |
| `ship_to` | selected `site_id` | `default` |
| `ship_from` | supplier role, then underlying `business_partner` | supplier: `ship_from`, `bill_from`, `default`; BP: `default` |
| `place_of_service` | selected `site_id` | `default` |

When a document is created with a reference, header address defaults should be
copied from the referenced commitment or its identity selections/snapshots where
available. If the referenced document has no usable address, fall back to the
same owner walk and purpose chains above.

## Line Rules

For PI lines created without a source line:

| Field | Default | UI behavior |
| --- | --- | --- |
| `company_code_id` | Virtual inheritance from PI header | Do not show as editable line field |
| `supplier_id` | Virtual inheritance from PI header | Do not show as editable line field |
| `commitment_line_id` | `NULL` | Hidden unless matching against PO |
| `goods_receipt_line_id` | `NULL` | Hidden unless matching against GR |
| `ses_line_id` | `NULL` | Hidden unless matching against SES |
| `site_id` | Copy from PI header `site_id` | Picker filtered by header `company_code_id` |
| `shipto_address_id` | Resolve from line `site_id`, then header default | Editable while parent is draft/rejected |
| `shipfrom_address_id` | Resolve from header supplier, then header default | Editable while parent is draft/rejected |
| tax jurisdictions | Derived from selected addresses | Read-only |
| tax group | Tax resolver output | Read-only unless manual override is allowed |

For PI lines created from a source line:

| Source | Reference field | Line defaults |
| --- | --- | --- |
| PO line | `commitment_line_id` | Copy item, UoM, price, dimensions, tax group, site, and delivery address from `commitment_line` |
| GR line | `goods_receipt_line_id` | Copy accepted quantity, item, UoM, price, warehouse/site-derived ship-to, and source PO line where present |
| SES line | `ses_line_id` | Copy service quantity, description, UoM, price, dimensions, tax group, and place-of-service where present |

Source reference fields are system-filled when the user imports or matches a
source line. They should not be manually editable in normal line entry.

## Address Resolution

Use `master.fn_resolve_default_address(p_tenant_id, p_owner_walk, p_purposes)`
for default-address picks where a multi-owner walk is needed.

When the owner walk contains `tenant`, `legal_entity`, `company_code`, `site`,
or `business_partner`, the effective purpose chain must collapse to `default`.
This keeps root owners from carrying duplicate role-specific address links.

Use `master.fn_resolve_address(...)` only for the older single owner+role path
or for snapshot capture paths that already use it.

Resolution must return both:

- `address_id`
- `tax_jurisdiction_id`

When an address is explicitly selected, stamp the tax jurisdiction from
`master.address.tax_jurisdiction_id`.

## Tax Rules

Tax jurisdiction is resolved from address geography:

1. `master.address.country_code` and `region`
2. `master.address.tax_jurisdiction_id`
3. document header or line jurisdiction snapshot

PI bill-side jurisdiction snapshots:

- `billto_tax_jurisdiction_id`
- `billfrom_tax_jurisdiction_id`

PI ship-side jurisdiction snapshots:

- `shipto_tax_jurisdiction_id`
- `shipfrom_tax_jurisdiction_id`

Line-level ship-to/from jurisdictions override header defaults only when the
line address is overridden. Otherwise the line inherits the header defaults.

Tax group/default rule should be resolver-driven. After the document leaves
draft/rejected, jurisdiction and tax snapshots are immutable.

## Existing Repo Mapping

Current schema already has:

- `document.purchase_invoice.default_shipto_address_id`
- `document.purchase_invoice.default_shipfrom_address_id`
- `document.purchase_invoice_line.shipto_address_id`
- `document.purchase_invoice_line.shipfrom_address_id`
- jurisdiction refresh triggers for PI/PIL ship-side addresses
- `control.entity_field.defaults` cascade metadata for PI line dimensions
- direct PI header fields for header bill/remit roles with live master joins

For multi-source header linking, use the companion contract in
`docs/specs/p2p-multi-source-linking.md`. The short version: add
`document.document_source` as an additive junction, keep exact source proof on
line FKs, and deprecate `purchase_invoice.commitment_id` only after the runtime
has migrated.

Important gap to wire next:

- source-reference defaulting from commitment/GR/SES lines into PI lines
- direct document identity defaults for PO/GR/SES/PI create flows
- runtime cleanup of any remaining non-demo org-master address links that still
  use document role purposes instead of `purpose = default`
- server-side site/company validation for every document and line path
- consistent UI hiding/read-only behavior for inherited `company_code_id`,
  `supplier_id`, and source reference fields
