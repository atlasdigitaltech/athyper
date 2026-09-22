-- Published setup evidence must remain a historical fact even when later
-- revisions or retirement commands are introduced.
CREATE FUNCTION master.hr_setup_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='hr_setup_publication' AND OLD.status='published' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Published HR setup receipt is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='hr_calendar_day_change' AND OLD.status='published' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Published calendar day change is immutable' USING ERRCODE='23514';
  END IF;
  IF TG_TABLE_NAME='hr_org_company_assignment' AND OLD.status IN('active','retired') THEN
    IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.effective_until IS DISTINCT FROM OLD.effective_until OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.approved_at IS DISTINCT FROM OLD.approved_at OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
       OR NEW.status NOT IN('active','retired') OR (OLD.status='retired' AND NEW.status<>'retired') THEN
      RAISE EXCEPTION 'Published organization assignment facts are immutable' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER hr_setup_publication_guard BEFORE UPDATE ON master.hr_setup_publication FOR EACH ROW EXECUTE FUNCTION master.hr_setup_reference_guard();
CREATE TRIGGER hr_org_company_assignment_guard BEFORE UPDATE ON master.hr_org_company_assignment FOR EACH ROW EXECUTE FUNCTION master.hr_setup_reference_guard();
CREATE TRIGGER hr_calendar_day_change_guard BEFORE UPDATE ON master.hr_calendar_day_change FOR EACH ROW EXECUTE FUNCTION master.hr_setup_reference_guard();
