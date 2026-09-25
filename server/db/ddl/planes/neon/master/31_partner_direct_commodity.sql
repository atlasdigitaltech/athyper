-- Add direct declarations without inventing UNSPSC facts from historical category assignments.
ALTER TABLE master.business_partner_commodity_classification
 ALTER COLUMN commodity_category_id DROP NOT NULL,
 ADD COLUMN commodity_code_id uuid REFERENCES shared.commodity_code(id) ON DELETE RESTRICT,
 ADD CONSTRAINT partner_classification_one_subject CHECK
   ((commodity_category_id IS NOT NULL)::integer + (commodity_code_id IS NOT NULL)::integer = 1);

CREATE FUNCTION master.guard_partner_direct_commodity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,shared AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.commodity_code_id IS DISTINCT FROM OLD.commodity_code_id THEN
  RAISE EXCEPTION 'Classification code identity is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='INSERT' AND NEW.commodity_code_id IS NOT NULL AND NOT EXISTS
  (SELECT 1 FROM shared.commodity_code WHERE id=NEW.commodity_code_id AND domain_code='unspsc' AND is_active) THEN
  RAISE EXCEPTION 'Direct declaration requires an active UNSPSC code' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION master.guard_partner_direct_commodity() FROM PUBLIC;
CREATE TRIGGER partner_direct_commodity_guard BEFORE INSERT OR UPDATE
 ON master.business_partner_commodity_classification FOR EACH ROW EXECUTE FUNCTION master.guard_partner_direct_commodity();
COMMENT ON COLUMN master.business_partner_commodity_classification.commodity_category_id IS
 'Legacy category-based fact only; never expand into inferred partner UNSPSC declarations. New native declarations select commodity_code_id.';
COMMENT ON COLUMN master.business_partner_commodity_classification.commodity_code_id IS
 'Direct UNSPSC declaration. Level comes from referenced catalog; no category mapping or commercial role required.';
