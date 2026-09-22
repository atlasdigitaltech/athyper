-- Server-side User commands set this transaction-local gate only after the
-- matching tenant-level authorization check. Keep ordinary principal access
-- self-only; the gate does not grant access across tenants.
CREATE POLICY hr_stage2_admin_read ON master.principal FOR SELECT TO athyperapp
  USING(tenant_id=shared.current_tenant_id_soft() AND current_setting('app.hr_stage2_user_admin',true)='true');
CREATE POLICY hr_stage2_admin_profile ON master.principal_profile FOR ALL TO athyperapp
  USING(tenant_id=shared.current_tenant_id_soft() AND current_setting('app.hr_stage2_user_admin',true)='true')
  WITH CHECK(tenant_id=shared.current_tenant_id() AND current_setting('app.hr_stage2_user_admin',true)='true');
CREATE POLICY hr_stage2_admin_binding_read ON master.principal_identity_binding FOR SELECT TO athyperapp
  USING(tenant_id=shared.current_tenant_id_soft() AND current_setting('app.hr_stage2_user_admin',true)='true');
CREATE POLICY hr_stage2_admin_ui_read ON master.principal_ui_profile FOR SELECT TO athyperapp
  USING(tenant_id=shared.current_tenant_id_soft() AND current_setting('app.hr_stage2_user_admin',true)='true');
