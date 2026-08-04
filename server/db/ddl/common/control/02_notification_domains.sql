CREATE DOMAIN control.notification_provider_health_d AS text
    CHECK (VALUE IN ('unknown', 'healthy', 'degraded', 'down'));
CREATE DOMAIN control.notification_template_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'retired'));
