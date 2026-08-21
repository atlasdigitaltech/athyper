-- Canonical-party coordinates used by local Athyper, Neon, and Mesh fixtures.
DO $canonical_fixture$
DECLARE v_su uuid:='00000000-0000-0000-0000-000000000000'; v_authority uuid:='11111111-1111-4111-8111-111111111111';
BEGIN
  INSERT INTO master.canonical_party(id,authority_tenant_id,party_kind,legal_name,display_name,verification_status,status,metadata,created_by)
  VALUES
   (md5('athyper:canonical-party:athyper-platform')::uuid,v_authority,'platform','Athyper Platform','Athyper Platform','verified','active','{"fixture":true}',v_su),
   (md5('athyper:canonical-party:athyper-group')::uuid,v_authority,'business_group','Athyper Group','Athyper Group','verified','active','{"fixture":true}',v_su),
   (md5('athyper:canonical-party:technostat')::uuid,v_authority,'business_group','Technostat Group','Technostat Group','verified','active','{"fixture":true}',v_su),
   (md5('athyper:canonical-party:cirrusatlantic')::uuid,v_authority,'legal_entity','CirrusAtlantic Limited','CirrusAtlantic','verified','active','{"fixture":true}',v_su),
   (md5('athyper:canonical-party:nimubus')::uuid,v_authority,'legal_entity','Nimubus Solutions','Nimubus Solutions','verified','active','{"fixture":true}',v_su)
  ON CONFLICT(id) DO UPDATE SET legal_name=excluded.legal_name,display_name=excluded.display_name,verification_status='verified',status='active',metadata=excluded.metadata,updated_at=now(),updated_by=v_su
  WHERE (master.canonical_party.legal_name,master.canonical_party.display_name,master.canonical_party.verification_status,master.canonical_party.status,master.canonical_party.metadata) IS DISTINCT FROM (excluded.legal_name,excluded.display_name,excluded.verification_status,excluded.status,excluded.metadata);
  UPDATE master.tenant SET canonical_party_id=md5('athyper:canonical-party:athyper-platform')::uuid,updated_at=now(),updated_by=v_su WHERE id=v_authority AND canonical_party_id IS DISTINCT FROM md5('athyper:canonical-party:athyper-platform')::uuid;
END $canonical_fixture$;
