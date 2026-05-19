-- 20260518_zzza_user_date_format_defaults.sql
-- Align runtime date display with the user-profile preference contract.
-- The default entity-field display is "16 May 2026" (%d %b %Y).

UPDATE master.tenant_profile
   SET date_format = '%d %b %Y',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE date_format IS NULL
    OR date_format IN ('%d/%m/%Y', '%d-%b-%Y');

UPDATE master.principal_ui_profile
   SET date_format = '%d %b %Y',
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'::uuid
 WHERE date_format IN ('%d/%m/%Y', '%d-%b-%Y');
