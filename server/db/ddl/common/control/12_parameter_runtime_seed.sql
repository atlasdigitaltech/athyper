-- First runtime parameter: applies at the next experience-bootstrap request.
INSERT INTO control.parameter_definition(id,code,name,value_type,default_value,allowed_values,tenant_can_override,reload_mode,cache_ttl_seconds,created_by)
VALUES(md5('control:parameter:experience.profile.default_density')::uuid,'experience.profile.default_density','Default experience density','enum','"comfortable"'::jsonb,'["comfortable","compact"]'::jsonb,true,'next_request',300,'00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT(code) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM control.parameter_definition WHERE code='experience.profile.default_density' AND status='active' AND value_type='enum' AND reload_mode='next_request' AND NOT is_sensitive
 AND default_value IN ('"comfortable"'::jsonb,'"compact"'::jsonb) AND allowed_values @> '["comfortable","compact"]'::jsonb AND allowed_values <@ '["comfortable","compact"]'::jsonb) THEN
 RAISE EXCEPTION 'Existing experience density parameter is incompatible; review it before deployment';
 END IF;
END $$;
