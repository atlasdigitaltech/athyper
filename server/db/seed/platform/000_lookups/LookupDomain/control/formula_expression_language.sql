INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('jsonlogic',   'JSONLogic',        'control.formula_expression_language', 'JSON-based rule engine (jsonlogic.com); safe, sandboxed, serialisable',              10),
    ('cel',         'CEL',              'control.formula_expression_language', 'Common Expression Language — Google; used in OPA / gRPC policy evaluation',         20),
    ('javascript',  'JavaScript (VM)',  'control.formula_expression_language', 'Sandboxed JS evaluated in an isolated Node.js VM context',                          30),
    ('python',      'Python (Sandbox)', 'control.formula_expression_language', 'Restricted Python evaluated via RestrictedPython or Pyodide WASM sandbox',          40),
    ('sql_expr',    'SQL Expression',   'control.formula_expression_language', 'PostgreSQL expression evaluated server-side using a named function',                 50)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
