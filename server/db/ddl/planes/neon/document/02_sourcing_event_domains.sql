CREATE DOMAIN document.sourcing_event_type_d AS text
    CHECK (VALUE IN ('rfi','rfq','rfp','reverse_auction'));
CREATE DOMAIN document.sourcing_buying_model_d AS text
    CHECK (VALUE IN ('federated','central_buyer'));
CREATE DOMAIN document.sourcing_event_status_d AS text
    CHECK (VALUE IN ('draft','published','evaluation','awarded','closed','cancelled'));
CREATE DOMAIN document.sourcing_company_role_d AS text
    CHECK (VALUE IN ('lead_buyer','participant','beneficiary'));
CREATE DOMAIN document.sourcing_company_status_d AS text
    CHECK (VALUE IN ('active','removed'));
CREATE DOMAIN document.sourcing_demand_status_d AS text
    CHECK (VALUE IN ('included','withdrawn','partially_awarded','awarded','converted'));
CREATE DOMAIN document.sourcing_award_status_d AS text
    CHECK (VALUE IN ('recommended','approved','rejected','converted','cancelled'));
CREATE DOMAIN document.sourcing_award_allocation_status_d AS text
    CHECK (VALUE IN ('planned','converted','cancelled'));
CREATE DOMAIN document.sourcing_intercompany_status_d AS text
    CHECK (VALUE IN ('planned','posted','cancelled'));
