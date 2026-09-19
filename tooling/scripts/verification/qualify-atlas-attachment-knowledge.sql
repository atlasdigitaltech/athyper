BEGIN;
SET LOCAL ROLE athyper_runtime;
SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';
SET LOCAL app.current_principal_id='cca94907-7519-5871-8e3c-6b11aa545c93';
DO $$ DECLARE changed integer; BEGIN
 IF NOT ai.fn_owned_knowledge_attachment('fc668e33-9d67-4015-83ba-8be70dfbb2c6','business_partner') THEN RAISE EXCEPTION 'Owner admission missing'; END IF;
 BEGIN
 INSERT INTO ai.atlas_knowledge_source(tenant_id,source_kind,source_id,entity_code,permission_code,status,created_by) VALUES(shared.current_tenant_id(),'record',gen_random_uuid()::text,'business_partner','neon.collaboration.attachment.read','active','cca94907-7519-5871-8e3c-6b11aa545c93');
 RAISE EXCEPTION 'Arbitrary source kind accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 UPDATE ai.atlas_knowledge_source SET permission_code='neon.ai.agent.use' WHERE source_id='fc668e33-9d67-4015-83ba-8be70dfbb2c6';
 RAISE EXCEPTION 'Source permission weakening accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('app.current_principal_id','00000000-0000-4000-8000-000000000001',true);
 UPDATE ai.atlas_knowledge_source SET status='disabled' WHERE source_id='fc668e33-9d67-4015-83ba-8be70dfbb2c6';GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>0 THEN RAISE EXCEPTION 'Other actor changed source'; END IF;
 UPDATE ai.atlas_knowledge_revision SET status='failed' WHERE id='6f2a53ae-330a-442a-81bf-61f329422e68';GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>0 THEN RAISE EXCEPTION 'Other actor changed revision'; END IF;
 UPDATE ai.atlas_knowledge_chunk SET index_status='failed' WHERE revision_id='6f2a53ae-330a-442a-81bf-61f329422e68';GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>0 THEN RAISE EXCEPTION 'Other actor changed chunk'; END IF;
 PERFORM set_config('app.current_tenant_id','55555555-5555-4555-8555-555555555555',true);
 IF EXISTS(SELECT 1 FROM ai.atlas_knowledge_source WHERE source_id='fc668e33-9d67-4015-83ba-8be70dfbb2c6') THEN RAISE EXCEPTION 'Cross-tenant source visible'; END IF;
 RAISE NOTICE 'PASS: source kind and permission constraints; owner-only source/revision/chunk writes; tenant isolation';
END $$;
ROLLBACK;
