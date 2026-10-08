import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it.skipIf(process.env.ENTITY_RESOURCE_DEV_POSTGRES !== "1")(
  "qualifies narrow resource proposal/review and immutable source under the control role with rollback",
  () => {
    const info = JSON.parse(
      execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
        encoding: "utf8",
      }),
    )[0];
    expect(info.Config.Labels["com.docker.compose.project"]).toBe(
      "athyper-dev",
    );
    const ddl = readFileSync(
      new URL(
        "../../../../../db/ddl/planes/studio/publication/23_authoring_resource_review.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const history = readFileSync(
      new URL(
        "../../../../../db/ddl/planes/studio/publication/24_authoring_resource_history.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const body = `BEGIN;SET LOCAL lock_timeout='2s';SET LOCAL statement_timeout='15s';SET LOCAL app.database_plane='studio';
 ${ddl.replaceAll("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION").replace("CREATE TRIGGER authoring_resource_source_immutable", "DROP TRIGGER IF EXISTS authoring_resource_source_immutable ON publication.release; CREATE TRIGGER authoring_resource_source_immutable")}
 ${history.replaceAll("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION")}
 DO $$ DECLARE actors uuid[]; tenant uuid; BEGIN
 SELECT p.tenant_id,array_agg(DISTINCT p.id) INTO tenant,actors FROM master.principal p JOIN master.principal_identity_binding b ON b.principal_id=p.id AND b.tenant_id=p.tenant_id WHERE p.principal_type='user' AND p.status='active' AND b.status='active' AND b.realm_key='platform-control' GROUP BY p.tenant_id HAVING count(DISTINCT p.id)>=2 LIMIT 1;
 IF actors IS NULL THEN RAISE EXCEPTION 'FIXTURE_HUMANS_UNAVAILABLE'; END IF;
 PERFORM set_config('app.current_tenant_id',tenant::text,true);PERFORM set_config('app.current_principal_id',actors[1]::text,true);PERFORM set_config('test.reviewer',actors[2]::text,true);PERFORM set_config('test.release',gen_random_uuid()::text,true);
 END $$;
 SELECT set_config('test.draft',id::text,true),set_config('test.entity',entity_id::text,true) FROM metadata.entity_change_set WHERE tenant_id IS NULL LIMIT 1;
 SET SESSION AUTHORIZATION athyper_control_api;
 DO $$ DECLARE s jsonb; r jsonb; id uuid:=current_setting('test.release')::uuid; BEGIN
 PERFORM * FROM publication.read_authoring_resource_history(current_setting('test.draft')::uuid,current_setting('test.entity')::uuid);
 s:=jsonb_build_object('releaseId',id,'publicationKey','fixture.review.'||replace(id::text,'-',''),'releaseNo',1,'generatedAt','2026-10-08T00:00:00Z','kind','entity_authoring_descriptor','payload',jsonb_build_object('fixture',true));
 r:=publication.propose_authoring_resource(s,repeat('a',64));
 IF r->>'status'<>'preparing' THEN RAISE EXCEPTION 'PROPOSAL_FAILED'; END IF;
 PERFORM publication.propose_authoring_resource(s,repeat('a',64));
 BEGIN PERFORM publication.approve_authoring_resource(id,repeat('a',64));RAISE EXCEPTION 'SELF_APPROVAL_ALLOWED';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RESOURCE_REVIEW_CONFLICT' THEN RAISE;END IF;END;
 PERFORM set_config('app.current_principal_id',current_setting('test.reviewer'),true);
 r:=publication.approve_authoring_resource(id,repeat('a',64));
 IF r->>'status'<>'approved' OR r->>'approved_by'<>current_setting('test.reviewer') THEN RAISE EXCEPTION 'APPROVAL_FAILED'; END IF;
 PERFORM publication.approve_authoring_resource(id,repeat('a',64));
 IF EXISTS(SELECT 1 FROM publication.read_authoring_resource_review(id)) THEN RAISE EXCEPTION 'BARE_LEDGER_IS_NOT_AUTHENTICATED_REVIEW'; END IF;
 END $$;
 RESET SESSION AUTHORIZATION;
 DO $$ BEGIN
 BEGIN UPDATE publication.release SET metadata='{}'::jsonb WHERE id=current_setting('test.release')::uuid;RAISE EXCEPTION 'SOURCE_MUTATION_ALLOWED';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'RESOURCE_SOURCE_IMMUTABLE' THEN RAISE;END IF;END;
 END $$;
 ROLLBACK;`;
    expect(() =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "athyper-dev-db-1",
          "psql",
          "-X",
          "-U",
          "postgres",
          "-d",
          "athyper_studio",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: body, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ),
    ).not.toThrow();
  },
);
