ALTER TABLE master.compensation_assignment
    ADD CONSTRAINT compensation_assignment_tenant_fk FOREIGN KEY(tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_employee_fk FOREIGN KEY(tenant_id,employee_id) REFERENCES master.employee(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_employment_fk FOREIGN KEY(tenant_id,employment_id) REFERENCES master.employment(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_pay_group_fk FOREIGN KEY(tenant_id,pay_group_id) REFERENCES master.pay_group(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_pay_structure_fk FOREIGN KEY(tenant_id,pay_structure_id) REFERENCES master.pay_structure(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_currency_fk FOREIGN KEY(currency_code) REFERENCES shared.currency(code) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_source_change_fk FOREIGN KEY(tenant_id,source_compensation_change_id) REFERENCES document.compensation_change(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_status_by_fk FOREIGN KEY(tenant_id,status_changed_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_created_by_fk FOREIGN KEY(tenant_id,created_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_updated_by_fk FOREIGN KEY(tenant_id,updated_by) REFERENCES master.principal(tenant_id,id) ON DELETE RESTRICT,
    ADD CONSTRAINT compensation_assignment_no_overlap_excl EXCLUDE USING gist (
        tenant_id WITH =, employee_id WITH =, pay_group_id WITH =,
        daterange(effective_from,coalesce(effective_until+1,'infinity'::date),'[)') WITH &&
    ) WHERE (status IN ('planned','active'));
