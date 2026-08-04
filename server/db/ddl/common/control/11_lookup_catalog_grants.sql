GRANT SELECT ON control.lookup_domain TO athyperapp;
GRANT SELECT, INSERT, UPDATE, DELETE ON control.lookup_value TO athyperapp;
GRANT ALL PRIVILEGES ON control.lookup_domain, control.lookup_value TO athyperadmin;
GRANT EXECUTE ON FUNCTION control.lookup_value_is_active(text, text, uuid)
  TO athyperapp, athyperadmin;
