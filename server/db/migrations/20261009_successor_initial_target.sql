BEGIN;
DO $migration$ DECLARE body text; old_text text; new_text text;
BEGIN
 body:=pg_get_functiondef('runtime_meta.fn_activate_release(uuid,jsonb)'::regprocedure);
 old_text:=$old$      SELECT * INTO v_previous_release FROM runtime_meta.applied_release WHERE id=v_head.applied_release_id FOR SHARE;
      IF v_head.applied_release_id IS NULL OR jsonb_typeof(v_expected) IS DISTINCT FROM 'object'
        OR (SELECT count(*) FROM jsonb_object_keys(v_expected))<>9
        OR (v_expected->>'appliedReleaseId'=v_head.applied_release_id::text
          AND v_expected->>'sourceReleaseId'=v_previous_release.source_release_id::text
          AND v_expected->>'sourceReleaseNo'=v_head.source_release_no::text
          AND v_expected->>'artifactHash'=v_head.artifact_hash
          AND v_expected->>'headVersion'=v_head.row_version::text
          AND v_expected->>'publicationKey'=v_candidate.publication_key
          AND v_expected->>'plane'=v_candidate.manifest->>'targetPlane'
          AND v_expected->>'environment'='local' AND v_expected->>'instance'='dev'
          AND v_candidate.source_release_no=v_head.source_release_no+1) IS NOT TRUE THEN
        RAISE EXCEPTION 'RELEASE_PREDECESSOR_CHANGED' USING ERRCODE='object_not_in_prerequisite_state';
      END IF;$old$;
 new_text:=$new$      IF v_expected->>'headState'='absent' THEN
        -- The signed target pin explicitly authorizes first installation of a
        -- successor source. Check absence under the publication-key lock above.
        IF v_head.applied_release_id IS NOT NULL OR jsonb_typeof(v_expected) IS DISTINCT FROM 'object'
          OR (SELECT count(*) FROM jsonb_object_keys(v_expected))<>7
          OR (v_expected->>'publicationKey'=v_candidate.publication_key
            AND v_expected->>'plane'=v_candidate.manifest->>'targetPlane'
            AND v_expected->>'environment'='local' AND v_expected->>'instance'='dev'
            AND v_expected->>'sourceReleaseNo'=(v_candidate.source_release_no-1)::text
            AND v_expected->>'sourceReleaseId' ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') IS NOT TRUE THEN
          RAISE EXCEPTION 'RELEASE_PREDECESSOR_CHANGED' USING ERRCODE='object_not_in_prerequisite_state';
        END IF;
      ELSE
      SELECT * INTO v_previous_release FROM runtime_meta.applied_release WHERE id=v_head.applied_release_id FOR SHARE;
      IF v_head.applied_release_id IS NULL OR jsonb_typeof(v_expected) IS DISTINCT FROM 'object'
        OR (SELECT count(*) FROM jsonb_object_keys(v_expected))<>9
        OR (v_expected->>'appliedReleaseId'=v_head.applied_release_id::text
          AND v_expected->>'sourceReleaseId'=v_previous_release.source_release_id::text
          AND v_expected->>'sourceReleaseNo'=v_head.source_release_no::text
          AND v_expected->>'artifactHash'=v_head.artifact_hash
          AND v_expected->>'headVersion'=v_head.row_version::text
          AND v_expected->>'publicationKey'=v_candidate.publication_key
          AND v_expected->>'plane'=v_candidate.manifest->>'targetPlane'
          AND v_expected->>'environment'='local' AND v_expected->>'instance'='dev'
          AND v_candidate.source_release_no=v_head.source_release_no+1) IS NOT TRUE THEN
        RAISE EXCEPTION 'RELEASE_PREDECESSOR_CHANGED' USING ERRCODE='object_not_in_prerequisite_state';
      END IF;
      END IF;$new$;
 IF strpos(body,old_text)=0 OR strpos(body,'headState')>0 THEN
   RAISE EXCEPTION 'SUCCESSOR_INITIAL_TARGET_PREDECESSOR_CHANGED';
 END IF;
 EXECUTE replace(body,old_text,new_text);
END $migration$;
COMMIT;
