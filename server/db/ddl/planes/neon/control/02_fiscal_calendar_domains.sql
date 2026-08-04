CREATE DOMAIN control.fiscal_calendar_type_d AS text
    CHECK (VALUE IN (
        'monthly', 'four_four_five', 'four_five_four',
        'five_four_four', 'thirteen_period', 'custom'
    ));

CREATE DOMAIN control.fiscal_year_label_rule_d AS text
    CHECK (VALUE IN ('start_year', 'end_year'));

CREATE DOMAIN control.fiscal_year_start_rule_d AS text
    CHECK (VALUE IN (
        'fixed_date', 'first_on_or_after',
        'last_on_or_before', 'nearest_weekday'
    ));

CREATE DOMAIN control.fiscal_leap_week_rule_d AS text
    CHECK (VALUE IN ('none', 'last_period'));

CREATE DOMAIN control.fiscal_rule_duration_unit_d AS text
    CHECK (VALUE IN ('point', 'day', 'week', 'month'));

CREATE DOMAIN control.fiscal_rule_anchor_d AS text
    CHECK (VALUE IN ('sequence', 'year_start', 'year_end'));

CREATE DOMAIN control.fiscal_calendar_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'retired'));

CREATE DOMAIN control.fiscal_calendar_assignment_status_d AS text
    CHECK (VALUE IN ('active', 'inactive'));
