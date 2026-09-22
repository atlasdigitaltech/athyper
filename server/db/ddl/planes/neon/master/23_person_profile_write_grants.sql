-- Writes are exposed only through the Workforce service's scoped, audited commands.
GRANT INSERT,UPDATE ON master.person_education,master.person_prior_employment TO athyperapp;
