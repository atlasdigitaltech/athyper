CREATE TRIGGER cron_schedule_updated_at
BEFORE UPDATE ON control.cron_schedule
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
