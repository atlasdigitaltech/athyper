BEGIN;
-- Forward-only successor of the exact installed source readers. Preserve their
-- admission, ownership, locking and byte budgets; expose structural inheritance
-- only from the database-verified correspondence, never from proposal JSON.
DO $$ DECLARE signature text; body text;
old_text text := $old$SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]') INTO ids$old$;
new_text text := $new$SELECT coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('native_available',metadata.native_identity_available(c.id,i.id)) ORDER BY i.id),'[]') INTO ids$new$;
BEGIN
 FOREACH signature IN ARRAY ARRAY['publication.read_native_product_review_source(uuid,integer)','publication.read_native_worker_source(uuid,integer)'] LOOP
  body:=pg_get_functiondef(signature::regprocedure);
  IF (length(body)-length(replace(body,old_text,'')))/length(old_text)<>1
  THEN RAISE EXCEPTION 'NATIVE_INHERITED_READ_PREDECESSOR_CHANGED:%',signature; END IF;
  EXECUTE replace(body,old_text,new_text);
 END LOOP;
END $$;
COMMIT;
