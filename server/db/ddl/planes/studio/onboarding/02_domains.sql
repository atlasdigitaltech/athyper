CREATE DOMAIN onboarding.case_status_d AS text
    CHECK (VALUE IN (
        'draft',
        'submitted',
        'qualifying',
        'awaiting_approval',
        'approved',
        'provisioning',
        'reconciling',
        'active',
        'rejected',
        'failed',
        'cancelled',
        'offboarding',
        'offboarded'
    ));

CREATE DOMAIN onboarding.entry_mode_d AS text
    CHECK (VALUE IN ('self_service', 'buyer_invited', 'ops_governed', 'system_triggered'));

CREATE DOMAIN onboarding.step_status_d AS text
    CHECK (VALUE IN (
        'pending', 'ready', 'running', 'blocked', 'completed', 'skipped',
        'failed', 'compensating', 'compensated'
    ));

CREATE DOMAIN onboarding.check_result_d AS text
    CHECK (VALUE IN ('pending', 'passed', 'failed', 'warning', 'waived'));

CREATE DOMAIN onboarding.resource_status_d AS text
    CHECK (VALUE IN (
        'planned', 'applying', 'applied', 'drifted', 'failed', 'retained', 'revoked'
    ));

CREATE DOMAIN onboarding.decision_status_d AS text
    CHECK (VALUE IN ('pending', 'approved', 'rejected', 'waived'));

CREATE DOMAIN onboarding.activation_criticality_d AS text
    CHECK (VALUE IN ('activation_critical', 'independent'));

COMMENT ON DOMAIN onboarding.case_status_d IS
  'Organization-onboarding saga lifecycle; it is not an employee onboarding or transactional workflow state.';
COMMENT ON DOMAIN onboarding.entry_mode_d IS
  'How an onboarding case entered Studio without cloning case tables per channel.';
COMMENT ON DOMAIN onboarding.activation_criticality_d IS
  'Whether a target must complete before the root case can activate.';
