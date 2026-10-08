-- Pure JSON shape validator required by existing field CHECK constraints.
GRANT EXECUTE ON FUNCTION metadata.fn_jsonb_object_has_only_keys(jsonb,text[]) TO athyper_product_command_app;
