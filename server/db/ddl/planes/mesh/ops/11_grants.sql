GRANT USAGE ON SCHEMA ops TO athyperadmin;
REVOKE ALL ON ops.reference_sync_checkpoint FROM PUBLIC;
GRANT ALL PRIVILEGES ON ops.reference_sync_checkpoint TO athyperadmin;
