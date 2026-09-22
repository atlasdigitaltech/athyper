-- Optimistic, auditable request transitions. Existing rows start at version 1.
ALTER TABLE document.user_profile_update_request
  ADD COLUMN row_version bigint NOT NULL DEFAULT 1,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN reviewed_by uuid,
  ADD COLUMN review_reason text,
  ADD CONSTRAINT user_profile_update_request_version_chk CHECK(row_version>0),
  ADD CONSTRAINT user_profile_update_request_review_pair_chk CHECK((reviewed_at IS NULL)=(reviewed_by IS NULL)),
  ADD CONSTRAINT user_profile_update_request_review_separation_chk CHECK(reviewed_by IS NULL OR reviewed_by<>requested_by),
  ADD CONSTRAINT user_profile_update_request_review_status_chk CHECK(status NOT IN('applied','rejected') OR reviewed_by IS NOT NULL);
