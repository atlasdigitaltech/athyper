/** Restricted control API only. No membership in athyperadmin, no BYPASSRLS,
 * no generic tenant-policy writer grant. Application IAM/MFA remains required. */
export function controlPolicyRls(authorityTenantId) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(authorityTenantId)) throw Error("Authority tenant UUID required");
  const scope = `tenant_id='${authorityTenantId}'::uuid AND tenant_id=shared.current_tenant_id_soft() AND entity_type='metadata.publication'`;
  const actor = `EXISTS(SELECT 1 FROM master.principal p WHERE p.tenant_id='${authorityTenantId}'::uuid AND p.id=master.current_principal_id_soft() AND p.principal_type='user' AND p.status='active')`;
  const parent = `EXISTS(SELECT 1 FROM control.policy_definition d WHERE d.id=policy_definition_id AND d.${scope})`;
  return `
DROP POLICY IF EXISTS control_publication_read ON control.policy_definition;
CREATE POLICY control_publication_read ON control.policy_definition FOR SELECT TO athyper_control_api USING(${scope} AND ${actor});
DROP POLICY IF EXISTS control_publication_insert ON control.policy_definition;
CREATE POLICY control_publication_insert ON control.policy_definition FOR INSERT TO athyper_control_api WITH CHECK(${scope} AND ${actor} AND status='draft' AND created_by=master.current_principal_id_soft());
DROP POLICY IF EXISTS control_publication_update ON control.policy_definition;
CREATE POLICY control_publication_update ON control.policy_definition FOR UPDATE TO athyper_control_api
 USING(${scope} AND ${actor} AND ((status='draft' AND created_by=master.current_principal_id_soft()) OR (status='pending_approval' AND created_by<>master.current_principal_id_soft())))
 WITH CHECK(${scope} AND ${actor} AND updated_by=master.current_principal_id_soft()
   AND ((status IN ('draft','pending_approval') AND created_by=master.current_principal_id_soft()) OR (status='active' AND created_by<>master.current_principal_id_soft())));
${["policy_rule", "policy_test_case"].map(table => `
DROP POLICY IF EXISTS control_publication_read ON control.${table};
CREATE POLICY control_publication_read ON control.${table} FOR SELECT TO athyper_control_api USING(${parent} AND ${actor});
DROP POLICY IF EXISTS control_publication_insert ON control.${table};
CREATE POLICY control_publication_insert ON control.${table} FOR INSERT TO athyper_control_api WITH CHECK(${parent} AND ${actor} AND created_by=master.current_principal_id_soft()
  AND EXISTS(SELECT 1 FROM control.policy_definition d WHERE d.id=policy_definition_id AND d.status='draft' AND d.created_by=master.current_principal_id_soft()));
`).join("\n")}
DROP POLICY IF EXISTS control_publication_test_update ON control.policy_test_case;
CREATE POLICY control_publication_test_update ON control.policy_test_case FOR UPDATE TO athyper_control_api
 USING(${parent} AND ${actor} AND EXISTS(SELECT 1 FROM control.policy_definition d WHERE d.id=policy_definition_id AND d.status='draft' AND d.created_by=master.current_principal_id_soft()))
 WITH CHECK(${parent} AND ${actor} AND updated_by=master.current_principal_id_soft());
DROP POLICY IF EXISTS control_publication_result_read ON control.policy_test_result;
CREATE POLICY control_publication_result_read ON control.policy_test_result FOR SELECT TO athyper_control_api USING(${parent} AND ${actor});
DROP POLICY IF EXISTS control_publication_result_insert ON control.policy_test_result;
CREATE POLICY control_publication_result_insert ON control.policy_test_result FOR INSERT TO athyper_control_api WITH CHECK(${parent} AND ${actor} AND executed_by=master.current_principal_id_soft());
`;
}
