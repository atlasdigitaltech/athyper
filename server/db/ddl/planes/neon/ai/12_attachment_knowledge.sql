-- The local API can ingest its actor's attachments, never arbitrary knowledge sources.
CREATE FUNCTION ai.fn_owned_knowledge_attachment(p_attachment text,p_entity text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,document,shared AS $$
 SELECT EXISTS(SELECT 1 FROM document.attachment a JOIN document.attachment_link l ON l.attachment_series_id=a.series_id AND l.tenant_id=a.tenant_id
 WHERE a.tenant_id=shared.current_tenant_id() AND a.id::text=p_attachment
 AND a.created_by=NULLIF(current_setting('app.current_principal_id',true),'')::uuid
 AND l.entity_type=p_entity AND l.entity_type NOT IN ('atlas.prompt','content.item'));
$$;
REVOKE ALL ON FUNCTION ai.fn_owned_knowledge_attachment(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai.fn_owned_knowledge_attachment(text,text) TO athyperapp;
CREATE POLICY attachment_owner_write ON ai.atlas_knowledge_source FOR ALL TO athyperapp
 USING(tenant_id=shared.current_tenant_id() AND source_kind='attachment' AND permission_code='neon.collaboration.attachment.read' AND ai.fn_owned_knowledge_attachment(source_id,entity_code))
 WITH CHECK(tenant_id=shared.current_tenant_id() AND source_kind='attachment' AND permission_code='neon.collaboration.attachment.read' AND ai.fn_owned_knowledge_attachment(source_id,entity_code));
CREATE POLICY attachment_owner_write ON ai.atlas_knowledge_revision FOR ALL TO athyperapp
 USING(tenant_id=shared.current_tenant_id() AND EXISTS(SELECT 1 FROM ai.atlas_knowledge_source s WHERE s.id=atlas_knowledge_revision.source_id AND s.tenant_id=shared.current_tenant_id() AND s.source_kind='attachment' AND s.permission_code='neon.collaboration.attachment.read' AND ai.fn_owned_knowledge_attachment(s.source_id,s.entity_code)))
 WITH CHECK(tenant_id=shared.current_tenant_id() AND EXISTS(SELECT 1 FROM ai.atlas_knowledge_source s WHERE s.id=atlas_knowledge_revision.source_id AND s.tenant_id=shared.current_tenant_id() AND s.source_kind='attachment' AND s.permission_code='neon.collaboration.attachment.read' AND ai.fn_owned_knowledge_attachment(s.source_id,s.entity_code)));
CREATE POLICY attachment_owner_write ON ai.atlas_knowledge_chunk FOR ALL TO athyperapp
 USING(tenant_id=shared.current_tenant_id() AND EXISTS(SELECT 1 FROM ai.atlas_knowledge_revision r JOIN ai.atlas_knowledge_source s ON s.id=r.source_id AND s.tenant_id=r.tenant_id WHERE r.id=atlas_knowledge_chunk.revision_id AND r.tenant_id=shared.current_tenant_id() AND s.source_kind='attachment' AND s.permission_code='neon.collaboration.attachment.read' AND ai.fn_owned_knowledge_attachment(s.source_id,s.entity_code)))
 WITH CHECK(tenant_id=shared.current_tenant_id() AND EXISTS(SELECT 1 FROM ai.atlas_knowledge_revision r JOIN ai.atlas_knowledge_source s ON s.id=r.source_id AND s.tenant_id=r.tenant_id WHERE r.id=atlas_knowledge_chunk.revision_id AND r.tenant_id=shared.current_tenant_id() AND s.source_kind='attachment' AND s.permission_code='neon.collaboration.attachment.read' AND ai.fn_owned_knowledge_attachment(s.source_id,s.entity_code)));
GRANT INSERT,UPDATE ON ai.atlas_knowledge_source,ai.atlas_knowledge_revision,ai.atlas_knowledge_chunk TO athyperapp;
