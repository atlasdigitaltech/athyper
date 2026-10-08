-- Only policy identity/status are required by the deferred graph validator.
GRANT USAGE ON SCHEMA control TO athyper_product_command_app;
GRANT SELECT(id,status) ON control.policy_definition TO athyper_product_command_app;
