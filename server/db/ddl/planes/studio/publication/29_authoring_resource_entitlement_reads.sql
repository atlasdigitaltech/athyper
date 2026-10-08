-- Complete invoker dependency inventory of the existing entitlement readers.
GRANT USAGE ON SCHEMA snapshot TO athyper_publication_service;
GRANT SELECT ON control.subscription_plan,control.tenant_module_entitlement_override,control.tenant_usage_limit_override,control.usage_metric_catalog,snapshot.subscription_plan_entitlement TO athyper_publication_service;
GRANT EXECUTE ON FUNCTION control.entitlement_plan_at(text,timestamptz) TO athyper_publication_service;
