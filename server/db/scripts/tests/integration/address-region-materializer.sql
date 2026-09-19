BEGIN;
DO $test$
DECLARE NEW record; item jsonb; address_id uuid; saved master.address%ROWTYPE;
BEGIN
 SELECT '44444444-4444-4444-8444-444444444444'::uuid tenant_id,gen_random_uuid() id,gen_random_uuid() decision_snapshot_id,'cca94907-7519-5871-8e3c-6b11aa545c93'::uuid updated_by INTO NEW;
 FOR item IN SELECT value FROM jsonb_array_elements('[{"addressKind":"street","purpose":"default","buildingName":"Example Tower","floor":"31","unit":"BC13","line1":"Example Tower","city":"Kuala Lumpur","countryCode":"MY","stateRegionCode":"MY-14","region":"Kuala Lumpur","normalizedHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},{"addressKind":"po_box","purpose":"default","poBox":"127","city":"Kuala Lumpur","postalCode":"50470","countryCode":"MY","stateRegionCode":"MY-14","region":"Kuala Lumpur","normalizedHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]'::jsonb) LOOP
 address_id:=gen_random_uuid();
  INSERT INTO master.address(id,tenant_id,address_type,address_kind,building_name,floor,unit,house_number,street_name,po_box,po_box_city,po_box_postal_code,line1,line2,city,region,state_region_code,postal_code,country_code,normalized_hash,
   formatted_address,validation_status,metadata,status,status_changed_at,status_changed_by,created_by)
  VALUES(address_id,NEW.tenant_id,item->>'purpose',COALESCE(NULLIF(item->>'addressKind',''),'street'),NULLIF(item->>'buildingName',''),NULLIF(item->>'floor',''),NULLIF(item->>'unit',''),NULLIF(item->>'houseNumber',''),NULLIF(item->>'streetName',''),NULLIF(item->>'poBox',''),CASE WHEN item->>'addressKind'='po_box' THEN NULLIF(item->>'city','') END,CASE WHEN item->>'addressKind'='po_box' THEN NULLIF(item->>'postalCode','') END,NULLIF(item->>'line1',''),NULLIF(item->>'line2',''),
   NULLIF(item->>'city',''),NULLIF(item->>'region',''),NULLIF(item->>'stateRegionCode',''),NULLIF(item->>'postalCode',''),(item->>'countryCode')::character(2),item->>'normalizedHash',
   NULLIF(concat_ws(', ',
    CASE WHEN item->>'addressKind'='po_box' THEN 'PO Box '||NULLIF(item->>'poBox','')
      WHEN NULLIF(item->>'line1','') IS NOT NULL OR NULLIF(item->>'line2','') IS NOT NULL THEN concat_ws(', ',NULLIF(item->>'line1',''),NULLIF(item->>'line2',''))
      ELSE NULLIF(concat_ws(', ',NULLIF(item->>'buildingName',''),CASE WHEN NULLIF(item->>'floor','') IS NOT NULL THEN 'Floor '||(item->>'floor') END,CASE WHEN NULLIF(item->>'unit','') IS NOT NULL THEN 'Unit '||(item->>'unit') END,NULLIF(concat_ws(' ',NULLIF(item->>'houseNumber',''),NULLIF(item->>'streetName','')),'')),'') END,
    NULLIF(item->>'city',''),NULLIF(item->>'region',''),NULLIF(item->>'postalCode',''),item->>'countryCode'),''),
   'unverified',jsonb_build_object('sourceCaseId',NEW.id,'sourceSnapshotId',NEW.decision_snapshot_id,'clientItemKey',item->>'clientItemKey'),'active',clock_timestamp(),NEW.updated_by,NEW.updated_by);

 SELECT * INTO saved FROM master.address WHERE id=address_id;
 IF saved.state_region_code IS DISTINCT FROM 'MY-14' THEN RAISE EXCEPTION 'Subdivision persistence failed'; END IF;
 IF item->>'addressKind'='street' THEN
  IF saved.building_name<>'Example Tower' OR saved.floor<>'31' OR saved.unit<>'BC13' OR saved.formatted_address<>'Example Tower, Kuala Lumpur, Kuala Lumpur, MY' THEN RAISE EXCEPTION 'Structured street persistence or formatting failed'; END IF;
 ELSE
  IF saved.po_box<>'127' OR saved.po_box_city<>'Kuala Lumpur' OR saved.po_box_postal_code<>'50470' OR saved.formatted_address<>'PO Box 127, Kuala Lumpur, Kuala Lumpur, 50470, MY' THEN RAISE EXCEPTION 'PO box persistence failed'; END IF;
 END IF;
 END LOOP;
END $test$;
ROLLBACK;
