SET ROLE athyperapp;
SET test.tenant='22222222-2222-4222-8222-222222222222';
SET test.actor='33333333-3333-4333-8333-333333333333';
INSERT INTO snapshot.entity_draft_save VALUES('11111111-1111-4111-8111-111111111111',1,'22222222-2222-4222-8222-222222222222','{"fields":[]}','hash',now(),'33333333-3333-4333-8333-333333333333','saved');
BEGIN;
INSERT INTO snapshot.entity_draft_save VALUES('11111111-1111-4111-8111-111111111111',2,'22222222-2222-4222-8222-222222222222','{"fields":[]}','hash',now(),'33333333-3333-4333-8333-333333333333','saved');
ROLLBACK;
DO $$ BEGIN IF (SELECT count(*) FROM snapshot.entity_draft_save)<>1 THEN RAISE EXCEPTION 'Rollback failed'; END IF; END $$;
SET test.tenant='44444444-4444-4444-8444-444444444444';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM snapshot.entity_draft_save) THEN RAISE EXCEPTION 'Tenant leak'; END IF; END $$;
RESET ROLE;
DO $$ BEGIN
 BEGIN UPDATE snapshot.entity_draft_save SET graph='{}'; RAISE EXCEPTION 'Mutation accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Draft save history is immutable' THEN RAISE; END IF; END;
 BEGIN DELETE FROM snapshot.entity_draft_save; RAISE EXCEPTION 'Deletion accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Draft save history is immutable' THEN RAISE; END IF; END;
END $$;
