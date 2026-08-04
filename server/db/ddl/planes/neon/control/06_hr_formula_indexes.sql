CREATE INDEX formula_expression_status_idx
    ON control.formula_expression (tenant_id, formula_kind, status);

CREATE INDEX formula_expression_version_effective_idx
    ON control.formula_expression_version
       (tenant_id, formula_expression_id, effective_from DESC)
    WHERE status = 'effective';

CREATE UNIQUE INDEX formula_expression_one_open_effective_uq
    ON control.formula_expression_version (tenant_id, formula_expression_id)
    WHERE status = 'effective' AND effective_until IS NULL;

CREATE INDEX rate_table_status_idx
    ON control.rate_table (tenant_id, rate_table_kind, status);

CREATE INDEX rate_table_country_idx
    ON control.rate_table (tenant_id, country_code, status)
    WHERE country_code IS NOT NULL;

CREATE INDEX rate_table_row_lookup_idx
    ON control.rate_table_row
       (tenant_id, rate_table_id, effective_from DESC, sequence_no);

CREATE INDEX rate_table_row_range_idx
    ON control.rate_table_row
       (tenant_id, rate_table_id, range_from, range_until)
    WHERE range_from IS NOT NULL;
