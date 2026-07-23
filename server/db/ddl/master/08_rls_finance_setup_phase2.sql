-- bank_account_link is a temporal relationship. Tenant application roles may
-- create and update it, but only platform maintenance may physically delete.
DROP POLICY IF EXISTS tenant_delete ON master.bank_account_link;

