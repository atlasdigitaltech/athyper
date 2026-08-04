GRANT USAGE ON SCHEMA ops TO athyperapp, athyperadmin;
REVOKE ALL ON ops.job_execution FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON ops.job_execution TO athyperapp;
GRANT ALL PRIVILEGES ON ops.job_execution TO athyperadmin;
