# Reference-permission repairs

These scripts repair global permission catalog definitions for an existing Neon
installation. They are not tenant fixtures or automatic foundation steps.

- `20260911_restore_neon_account_bank_permission_reference.sql` restores the
  account/bank permission reference catalog used by the shared DEV repair record.
- `20260912_finance_journal_activity_permission.sql` installs the finance activity
  reference permission. Its existing operational-access and isolated-candidate
  callers now read this location.

SQL bytes are preserved from their former `server/db/migrations/` locations.
`server/db/migrations/inventory.json` maps the original names and checksums.
Historical receipts retain their original coordinates. Use the existing target
validation and approval workflow of the calling tool; these are not setup commands
to run automatically on DEV or QA.
