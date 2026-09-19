-- CREATE TABLE ignored.line_comment (id uuid);
CREATE
  TABLE IF NOT EXISTS "Shared"."Quoted_Table" (
    id uuid PRIMARY KEY,
    note text DEFAULT 'CREATE TABLE ignored.string_literal (id uuid)'
  );
/* CREATE TABLE ignored.block_comment (id uuid); */
DO $body$
BEGIN
  EXECUTE 'CREATE TABLE ignored.dynamic_sql (id uuid)';
END
$body$;
