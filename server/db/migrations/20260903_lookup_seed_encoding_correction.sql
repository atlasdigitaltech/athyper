BEGIN;

UPDATE control.lookup_domain
   SET name = replace(replace(replace(name, '???', '—'), '??', '—'), U&'\FFFD', '—'),
       description = replace(replace(replace(description, '???', '—'), '??', '—'), U&'\FFFD', '—'),
       updated_at = clock_timestamp(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE name LIKE '%??%'
    OR description LIKE '%??%'
    OR name LIKE '%' || U&'\FFFD' || '%'
    OR description LIKE '%' || U&'\FFFD' || '%';

UPDATE control.lookup_value
   SET name = replace(replace(replace(name, '???', '—'), '??', '—'), U&'\FFFD', '—'),
       description = replace(replace(replace(description, '???', '—'), '??', '—'), U&'\FFFD', '—'),
       updated_at = clock_timestamp(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE name LIKE '%??%'
    OR description LIKE '%??%'
    OR name LIKE '%' || U&'\FFFD' || '%'
    OR description LIKE '%' || U&'\FFFD' || '%';

-- Restore the few operators/currency examples for which a generic separator
-- would still be semantically ambiguous.
UPDATE control.lookup_value
   SET description = 'Tax is included within Invoice Total. Net = Total / (1 + rate). Common in B2C and many VAT jurisdictions.',
       updated_at = clock_timestamp(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE domain_code = 'document.purchase_invoice_tax_mode' AND code = 'inclusive';

UPDATE control.lookup_value
   SET name = 'Units × Rate',
       description = 'Quantity × unit rate (e.g., overtime hours × hourly rate)',
       updated_at = clock_timestamp(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE domain_code = 'master.pay_component_value_type' AND code = 'units';

UPDATE control.lookup_value
   SET description = 'Static monetary amount (e.g., 1,600 currency units/month transport allowance)',
       updated_at = clock_timestamp(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE domain_code = 'master.pay_component_value_type' AND code = 'amount';

COMMIT;
