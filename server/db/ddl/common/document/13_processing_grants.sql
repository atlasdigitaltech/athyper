-- Background extraction/derivative workers remain subject to document tenant RLS.
-- Never grant the application role or source-file lifecycle mutation to processors.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='athyper_jobs_service') THEN
    GRANT USAGE ON SCHEMA document TO athyper_jobs_service;
    GRANT SELECT ON document.attachment,document.attachment_series,document.attachment_link
      TO athyper_jobs_service;
    GRANT UPDATE (extracted_text,extracted_text_chars,text_extracted_at,
      text_extraction_status,text_extraction_error,pii_detected,pii_types,pii_scanned_at,
      metadata,updated_at,updated_by) ON document.attachment TO athyper_jobs_service;
    GRANT SELECT,INSERT,UPDATE ON document.attachment_derivative TO athyper_jobs_service;
  END IF;
END;
$$;
