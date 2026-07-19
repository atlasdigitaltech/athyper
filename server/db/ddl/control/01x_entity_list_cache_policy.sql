-- Additive upgrade for the entity-class cache-policy contract.

ALTER TABLE control.entity_class_profile
    ADD COLUMN IF NOT EXISTS cache_policy jsonb NOT NULL DEFAULT '{}';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'control.entity_class_profile'::regclass
           AND conname = 'ecp_cache_policy_chk'
    ) THEN
        ALTER TABLE control.entity_class_profile
            ADD CONSTRAINT ecp_cache_policy_chk
            CHECK (jsonb_typeof(cache_policy) = 'object');
    END IF;
END $$;

COMMENT ON COLUMN control.entity_class_profile.cache_policy IS
    'Typed entity-list cache defaults and prefetch constraints for this class. '
    'Resolution precedence is entity display_config.list_cache, class cache_policy, platform default.';
