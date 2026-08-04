CREATE DOMAIN snapshot.capture_kind_d AS text
    CHECK (
        VALUE IN (
            'create',
            'version',
            'publish',
            'release',
            'submit',
            'approval',
            'commitment',
            'fulfillment',
            'financial_post',
            'amendment',
            'reversal',
            'withdrawal',
            'reconcile',
            'migration',
            'manual'
        )
    );

CREATE DOMAIN snapshot.retention_class_d AS text
    CHECK (
        VALUE IN (
            'permanent',
            'legal',
            'financial',
            'operational',
            'standard',
            'temporary'
        )
    );
