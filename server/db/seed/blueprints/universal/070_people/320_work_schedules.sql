-- work_pattern + work_pattern_day + shift_type. 10 patterns covering common
-- weekday/compressed/rotating/weekend/night shifts; 10 shift types.
-- Patterns:
--   standard_5d Mon-Fri 40h | extended_5d Mon-Fri 45h | compressed_4d Mon-Thu 40h
--   part_time_3d 24h | rotating_3shift 3-day cycle | two_shift_alt 14-day A/B
--   weekend_only Sat-Sun | flexible_5d 40h target | night_5d Mon-Fri 40h
--   six_day_shift Mon-Sat 48h (manufacturing/retail)
--
-- Shift types (10):
--   day_standard Â· day_office Â· morning_early Â· day_mid Â· afternoon Â·
-- DB CHECK enforces planned_minutes = EXTRACT(EPOCH FROM end_time-start_time)/60
-- minus break_minutes. Overnight/flexible days pass by leaving start/end NULL.

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := 'universal_hr_work_schedules';
    v_ver  text := '1.0.0';
    v_n    int;
BEGIN
    CREATE TEMP SEQUENCE IF NOT EXISTS wave5_people_work_seq START WITH 1 INCREMENT BY 1;
    ALTER SEQUENCE pg_temp.wave5_people_work_seq RESTART WITH 1;
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set â€” run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    RAISE NOTICE '[%] Starting work schedule seed for tenant %', v_pack, v_tid;

    -- ========================================================================
    -- WORK PATTERNS
    -- ========================================================================
    INSERT INTO master.work_pattern (
        id, tenant_id, code, name, pattern_type, cycle_length_days, weekly_hours,
        status, created_by
    )
    VALUES
        -- 5-day standard â€” universally the most common office pattern
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'standard_5d',      'Standard 5-Day Week',
         'weekly',    7,  40.00, 'active', v_su),

        -- 5-day extended â€” common in law, banking, consulting
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'extended_5d',      'Extended 5-Day Week (45 h)',
         'weekly',    7,  45.00, 'active', v_su),

        -- 4-day compressed â€” popular in tech and public sector
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'compressed_4d',    'Compressed 4-Day Week',
         'weekly',    7,  40.00, 'active', v_su),

        -- 3-day part-time â€” caregivers, returners, students
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'part_time_3d',     'Part-Time 3-Day Week',
         'weekly',    7,  24.00, 'active', v_su),

        -- 3-shift rotating â€” manufacturing, utilities, healthcare
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'rotating_3shift',  '3-Shift Rotating Pattern',
         'rotating',  3,  NULL,  'active', v_su),

        -- 2-shift alternating fortnightly â€” logistics, call centres
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'two_shift_alt',    '2-Shift Alternating (Fortnightly)',
         'bi_weekly', 14, 40.00, 'active', v_su),

        -- Weekend only â€” retail, hospitality, security
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'weekend_only',     'Weekend Pattern (Satâ€“Sun)',
         'weekly',    7,  16.00, 'active', v_su),

        -- Flexible â€” remote, async, results-based roles
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'flexible_5d',      'Flexible 5-Day (No Fixed Hours)',
         'flexible',  7,  40.00, 'active', v_su),

        -- Night-only â€” security, data centres, emergency services
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'night_5d',         'Night Shift 5-Day Week',
         'weekly',    7,  40.00, 'active', v_su),

        -- 6-day â€” retail, manufacturing, hospitality in busy markets
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'six_day_shift',    'Six-Day Work Week (48 h)',
         'weekly',    7,  48.00, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name              = EXCLUDED.name,
            pattern_type      = EXCLUDED.pattern_type,
            cycle_length_days = EXCLUDED.cycle_length_days,
            weekly_hours      = EXCLUDED.weekly_hours,
            updated_at        = now(),
            updated_by        = v_su
        WHERE (master.work_pattern.name, master.work_pattern.pattern_type,
               master.work_pattern.cycle_length_days, master.work_pattern.weekly_hours)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.pattern_type,
                                EXCLUDED.cycle_length_days, EXCLUDED.weekly_hours);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] work_pattern: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- WORK PATTERN DAYS
    -- One section per pattern; ON CONFLICT handles reruns cleanly.
    --
    -- Day numbering convention: 1 = first day of cycle (Monday for weekly).
    -- Overnight-shift days use NULL start/end so the CHECK constraint passes.
    -- planned_minutes is always the net working minutes (gross minus break).
    --
    -- Verification of planned_minutes:
    --   09:00â†’17:30 minus 30 min break = 510âˆ’30 = 480 min âœ“
    --   08:00â†’18:00 minus 60 min break = 600âˆ’60 = 540 min âœ“
    --   07:00â†’18:00 minus 60 min break = 660âˆ’60 = 600 min âœ“
    --   07:00â†’15:00 minus 30 min break = 480âˆ’30 = 450 min âœ“
    --   15:00â†’23:00 minus 30 min break = 480âˆ’30 = 450 min âœ“
    --   08:00â†’16:30 minus 30 min break = 510âˆ’30 = 480 min âœ“
    -- ========================================================================

    -- â”€â”€ standard_5d  (Monâ€“Fri working, Satâ€“Sun off) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    WITH wp AS (SELECT id FROM master.work_pattern WHERE tenant_id = v_tid AND code = 'standard_5d')
    INSERT INTO master.work_pattern_day (
        id, tenant_id, work_pattern_id, day_no,
        is_working_day, start_time, end_time, break_minutes, planned_minutes,
        created_by
    )
    SELECT md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, wp.id,
           x.day_no, x.working,
           x.st::time, x.et::time,
           x.brk, x.planned,
           v_su
    FROM wp CROSS JOIN (VALUES
        (1::smallint, true,  '09:00'::text, '17:30'::text, 30::smallint, 480::smallint),
        (2::smallint, true,  '09:00',       '17:30',       30,           480),
        (3::smallint, true,  '09:00',       '17:30',       30,           480),
        (4::smallint, true,  '09:00',       '17:30',       30,           480),
        (5::smallint, true,  '09:00',       '17:30',       30,           480),
        (6::smallint, false, NULL,          NULL,           0,            0),
        (7::smallint, false, NULL,          NULL,           0,            0)
    ) AS x(day_no, working, st, et, brk, planned)
    ON CONFLICT (tenant_id, work_pattern_id, day_no) DO UPDATE
        SET is_working_day  = EXCLUDED.is_working_day,
            start_time      = EXCLUDED.start_time,
            end_time        = EXCLUDED.end_time,
            break_minutes   = EXCLUDED.break_minutes,
            planned_minutes = EXCLUDED.planned_minutes,
            updated_at      = now(),
            updated_by      = v_su;

    -- â”€â”€ extended_5d  (Monâ€“Fri, 45 h/wk, 08:00â€“18:00 60 min break) â”€â”€â”€â”€â”€â”€â”€
    WITH wp AS (SELECT id FROM master.work_pattern WHERE tenant_id = v_tid AND code = 'extended_5d')
    INSERT INTO master.work_pattern_day (
        id, tenant_id, work_pattern_id, day_no,
        is_working_day, start_time, end_time, break_minutes, planned_minutes,
        created_by
    )
    SELECT md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, wp.id,
           x.day_no, x.working, x.st::time, x.et::time, x.brk, x.planned, v_su
    FROM wp CROSS JOIN (VALUES
        (1::smallint, true,  '08:00'::text, '18:00'::text, 60::smallint, 540::smallint),
        (2::smallint, true,  '08:00',       '18:00',       60,           540),
        (3::smallint, true,  '08:00',       '18:00',       60,           540),
        (4::smallint, true,  '08:00',       '18:00',       60,           540),
        (5::smallint, true,  '08:00',       '18:00',       60,           540),
        (6::smallint, false, NULL,          NULL,           0,            0),
        (7::smallint, false, NULL,          NULL,           0,            0)
    ) AS x(day_no, working, st, et, brk, planned)
    ON CONFLICT (tenant_id, work_pattern_id, day_no) DO UPDATE
        SET is_working_day  = EXCLUDED.is_working_day,
            start_time      = EXCLUDED.start_time,
            end_time        = EXCLUDED.end_time,
            break_minutes   = EXCLUDED.break_minutes,
            planned_minutes = EXCLUDED.planned_minutes,
            updated_at      = now(),
            updated_by      = v_su;

    -- â”€â”€ compressed_4d  (Monâ€“Thu, 07:00â€“18:00, 60 min break, 600 min/day) â”€
    WITH wp AS (SELECT id FROM master.work_pattern WHERE tenant_id = v_tid AND code = 'compressed_4d')
    INSERT INTO master.work_pattern_day (
        id, tenant_id, work_pattern_id, day_no,
        is_working_day, start_time, end_time, break_minutes, planned_minutes,
        created_by
    )
    SELECT md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, wp.id,
           x.day_no, x.working, x.st::time, x.et::time, x.brk, x.planned, v_su
    FROM wp CROSS JOIN (VALUES
        (1::smallint, true,  '07:00'::text, '18:00'::text, 60::smallint, 600::smallint),
        (2::smallint, true,  '07:00',       '18:00',       60,           600),
        (3::smallint, true,  '07:00',       '18:00',       60,           600),
        (4::smallint, true,  '07:00',       '18:00',       60,           600),
        (5::smallint, false, NULL,          NULL,           0,            0),
        (6::smallint, false, NULL,          NULL,           0,            0),
        (7::smallint, false, NULL,          NULL,           0,            0)
    ) AS x(day_no, working, st, et, brk, planned)
    ON CONFLICT (tenant_id, work_pattern_id, day_no) DO UPDATE
        SET is_working_day  = EXCLUDED.is_working_day,
            start_time      = EXCLUDED.start_time,
            end_time        = EXCLUDED.end_time,
            break_minutes   = EXCLUDED.break_minutes,
            planned_minutes = EXCLUDED.planned_minutes,
            updated_at      = now(),
            updated_by      = v_su;

    -- â”€â”€ part_time_3d  (Mon, Wed, Fri working; Tue, Thu, Sat, Sun off) â”€â”€â”€â”€
    WITH wp AS (SELECT id FROM master.work_pattern WHERE tenant_id = v_tid AND code = 'part_time_3d')
    INSERT INTO master.work_pattern_day (
        id, tenant_id, work_pattern_id, day_no,
        is_working_day, start_time, end_time, break_minutes, planned_minutes,
        created_by
    )
    SELECT md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, wp.id,
           x.day_no, x.working, x.st::time, x.et::time, x.brk, x.planned, v_su
    FROM wp CROSS JOIN (VALUES
        (1::smallint, true,  '09:00'::text, '17:30'::text, 30::smallint, 480::smallint),
        (2::smallint, false, NULL,          NULL,           0,            0),
        (3::smallint, true,  '09:00',       '17:30',       30,           480),
        (4::smallint, false, NULL,          NULL,           0,            0),
        (5::smallint, true,  '09:00',       '17:30',       30,           480),
        (6::smallint, false, NULL,          NULL,           0,            0),
        (7::smallint, false, NULL,          NULL,           0,            0)
    ) AS x(day_no, working, st, et, brk, planned)
    ON CONFLICT (tenant_id, work_pattern_id, day_no) DO UPDATE
        SET is_working_day  = EXCLUDED.is_working_day,
            start_time      = EXCLUDED.start_time,
            end_time        = EXCLUDED.end_time,
            break_minutes   = EXCLUDED.break_minutes,
            planned_minutes = EXCLUDED.planned_minutes,
            updated_at      = now(),
            updated_by      = v_su;

    -- â”€â”€ rotating_3shift  (3-day cycle: Day / Evening / Night)
    -- Day 1: 07:00â€“15:00, break 30, planned 450
    -- Day 2: 15:00â€“23:00, break 30, planned 450
    -- Day 3: Night (22:00â€“06:00 crosses midnight â†’ NULL times, planned 450)
    WITH wp AS (SELECT id FROM master.work_pattern WHERE tenant_id = v_tid AND code = 'rotating_3shift')
    INSERT INTO master.work_pattern_day (
        id, tenant_id, work_pattern_id, day_no,
        is_working_day, start_time, end_time, break_minutes, planned_minutes,
        created_by
    )
    SELECT md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, wp.id,
           x.day_no, x.working, x.st::time, x.et::time, x.brk, x.planned, v_su
    FROM wp CROSS JOIN (VALUES
        (1::smallint, true, '07:00'::text, '15:00'::text, 30::smallint, 450::smallint),
        (2::smallint, true, '15:00',       '23:00',       30,           450),
        (3::smallint, true, NULL,          NULL,          30,           450)
    ) AS x(day_no, working, st, et, brk, planned)
    ON CONFLICT (tenant_id, work_pattern_id, day_no) DO UPDATE
        SET is_working_day  = EXCLUDED.is_working_day,
            start_time      = EXCLUDED.start_time,
            end_time        = EXCLUDED.end_time,
            break_minutes   = EXCLUDED.break_minutes,
            planned_minutes = EXCLUDED.planned_minutes,
            updated_at      = now(),
            updated_by      = v_su;

    -- â”€â”€ two_shift_alt  (14-day cycle)
    -- Days 1â€“5: Day shift Monâ€“Fri   (07:00â€“15:00, break 30, planned 450)
    -- Days 6â€“7: Off Satâ€“Sun
    -- Days 8â€“12: Evening shift Monâ€“Fri (15:00â€“23:00, break 30, planned 450)
    -- Days 13â€“14: Off Satâ€“Sun
    WITH wp AS (SELECT id FROM master.work_pattern WHERE tenant_id = v_tid AND code = 'two_shift_alt')
    INSERT INTO master.work_pattern_day (
        id, tenant_id, work_pattern_id, day_no,
        is_working_day, start_time, end_time, break_minutes, planned_minutes,
        created_by
    )
    SELECT md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, wp.id,
           x.day_no, x.working, x.st::time, x.et::time, x.brk, x.planned, v_su
    FROM wp CROSS JOIN (VALUES
        ( 1::smallint, true,  '07:00'::text, '15:00'::text, 30::smallint, 450::smallint),
        ( 2::smallint, true,  '07:00',       '15:00',       30,           450),
        ( 3::smallint, true,  '07:00',       '15:00',       30,           450),
        ( 4::smallint, true,  '07:00',       '15:00',       30,           450),
        ( 5::smallint, true,  '07:00',       '15:00',       30,           450),
        ( 6::smallint, false, NULL,          NULL,           0,            0),
        ( 7::smallint, false, NULL,          NULL,           0,            0),
        ( 8::smallint, true,  '15:00',       '23:00',       30,           450),
        ( 9::smallint, true,  '15:00',       '23:00',       30,           450),
        (10::smallint, true,  '15:00',       '23:00',       30,           450),
        (11::smallint, true,  '15:00',       '23:00',       30,           450),
        (12::smallint, true,  '15:00',       '23:00',       30,           450),
        (13::smallint, false, NULL,          NULL,           0,            0),
        (14::smallint, false, NULL,          NULL,           0,            0)
    ) AS x(day_no, working, st, et, brk, planned)
    ON CONFLICT (tenant_id, work_pattern_id, day_no) DO UPDATE
        SET is_working_day  = EXCLUDED.is_working_day,
            start_time      = EXCLUDED.start_time,
            end_time        = EXCLUDED.end_time,
            break_minutes   = EXCLUDED.break_minutes,
            planned_minutes = EXCLUDED.planned_minutes,
            updated_at      = now(),
            updated_by      = v_su;

    -- â”€â”€ weekend_only  (Satâ€“Sun working, Monâ€“Fri off)
    WITH wp AS (SELECT id FROM master.work_pattern WHERE tenant_id = v_tid AND code = 'weekend_only')
    INSERT INTO master.work_pattern_day (
        id, tenant_id, work_pattern_id, day_no,
        is_working_day, start_time, end_time, break_minutes, planned_minutes,
        created_by
    )
    SELECT md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, wp.id,
           x.day_no, x.working, x.st::time, x.et::time, x.brk, x.planned, v_su
    FROM wp CROSS JOIN (VALUES
        (1::smallint, false, NULL,          NULL,           0::smallint,  0::smallint),
        (2::smallint, false, NULL,          NULL,           0,            0),
        (3::smallint, false, NULL,          NULL,           0,            0),
        (4::smallint, false, NULL,          NULL,           0,            0),
        (5::smallint, false, NULL,          NULL,           0,            0),
        (6::smallint, true,  '09:00'::text, '17:30'::text, 30,           480),
        (7::smallint, true,  '09:00',       '17:30',       30,           480)
    ) AS x(day_no, working, st, et, brk, planned)
    ON CONFLICT (tenant_id, work_pattern_id, day_no) DO UPDATE
        SET is_working_day  = EXCLUDED.is_working_day,
            start_time      = EXCLUDED.start_time,
            end_time        = EXCLUDED.end_time,
            break_minutes   = EXCLUDED.break_minutes,
            planned_minutes = EXCLUDED.planned_minutes,
            updated_at      = now(),
            updated_by      = v_su;

    -- â”€â”€ flexible_5d  (Monâ€“Fri, no fixed hours; target 480 min/day)
    -- NULL times are allowed by the CHECK when start_time IS NULL.
    WITH wp AS (SELECT id FROM master.work_pattern WHERE tenant_id = v_tid AND code = 'flexible_5d')
    INSERT INTO master.work_pattern_day (
        id, tenant_id, work_pattern_id, day_no,
        is_working_day, start_time, end_time, break_minutes, planned_minutes,
        created_by
    )
    SELECT md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, wp.id,
           x.day_no, x.working, NULL::time, NULL::time, x.brk, x.planned, v_su
    FROM wp CROSS JOIN (VALUES
        (1::smallint, true,  0::smallint, 480::smallint),
        (2::smallint, true,  0,           480),
        (3::smallint, true,  0,           480),
        (4::smallint, true,  0,           480),
        (5::smallint, true,  0,           480),
        (6::smallint, false, 0,           0),
        (7::smallint, false, 0,           0)
    ) AS x(day_no, working, brk, planned)
    ON CONFLICT (tenant_id, work_pattern_id, day_no) DO UPDATE
        SET is_working_day  = EXCLUDED.is_working_day,
            start_time      = EXCLUDED.start_time,
            end_time        = EXCLUDED.end_time,
            break_minutes   = EXCLUDED.break_minutes,
            planned_minutes = EXCLUDED.planned_minutes,
            updated_at      = now(),
            updated_by      = v_su;

    -- â”€â”€ night_5d  (Monâ€“Fri nights, 22:00â€“06:00 â†’ NULL times, 450 min planned)
    WITH wp AS (SELECT id FROM master.work_pattern WHERE tenant_id = v_tid AND code = 'night_5d')
    INSERT INTO master.work_pattern_day (
        id, tenant_id, work_pattern_id, day_no,
        is_working_day, start_time, end_time, break_minutes, planned_minutes,
        created_by
    )
    SELECT md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, wp.id,
           x.day_no, x.working, NULL::time, NULL::time, x.brk, x.planned, v_su
    FROM wp CROSS JOIN (VALUES
        (1::smallint, true,  30::smallint, 450::smallint),
        (2::smallint, true,  30,           450),
        (3::smallint, true,  30,           450),
        (4::smallint, true,  30,           450),
        (5::smallint, true,  30,           450),
        (6::smallint, false,  0,             0),
        (7::smallint, false,  0,             0)
    ) AS x(day_no, working, brk, planned)
    ON CONFLICT (tenant_id, work_pattern_id, day_no) DO UPDATE
        SET is_working_day  = EXCLUDED.is_working_day,
            start_time      = EXCLUDED.start_time,
            end_time        = EXCLUDED.end_time,
            break_minutes   = EXCLUDED.break_minutes,
            planned_minutes = EXCLUDED.planned_minutes,
            updated_at      = now(),
            updated_by      = v_su;

    -- â”€â”€ six_day_shift  (Monâ€“Sat, 08:00â€“16:30, break 30, planned 480)
    -- 480 min/day Ã— 6 days = 2880 min = 48 h/wk
    -- 16:30 âˆ’ 08:00 = 8.5 h = 510 min âˆ’ 30 = 480 âœ“
    WITH wp AS (SELECT id FROM master.work_pattern WHERE tenant_id = v_tid AND code = 'six_day_shift')
    INSERT INTO master.work_pattern_day (
        id, tenant_id, work_pattern_id, day_no,
        is_working_day, start_time, end_time, break_minutes, planned_minutes,
        created_by
    )
    SELECT md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, wp.id,
           x.day_no, x.working, x.st::time, x.et::time, x.brk, x.planned, v_su
    FROM wp CROSS JOIN (VALUES
        (1::smallint, true,  '08:00'::text, '16:30'::text, 30::smallint, 480::smallint),
        (2::smallint, true,  '08:00',       '16:30',       30,           480),
        (3::smallint, true,  '08:00',       '16:30',       30,           480),
        (4::smallint, true,  '08:00',       '16:30',       30,           480),
        (5::smallint, true,  '08:00',       '16:30',       30,           480),
        (6::smallint, true,  '08:00',       '16:30',       30,           480),
        (7::smallint, false, NULL,          NULL,           0,            0)
    ) AS x(day_no, working, st, et, brk, planned)
    ON CONFLICT (tenant_id, work_pattern_id, day_no) DO UPDATE
        SET is_working_day  = EXCLUDED.is_working_day,
            start_time      = EXCLUDED.start_time,
            end_time        = EXCLUDED.end_time,
            break_minutes   = EXCLUDED.break_minutes,
            planned_minutes = EXCLUDED.planned_minutes,
            updated_at      = now(),
            updated_by      = v_su;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] work_pattern_day: last pattern batch % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- SHIFT TYPES  (10 universal slots)
    --
    -- paid_minutes = gross_minutes âˆ’ break_minutes
    -- is_overnight = true â†’ DB skips the end_time > start_time check,
    --   allowing representations like 22:00â€“06:00.
    --
    -- Gross/net calculations:
    --   07:00â†’15:00  480 min âˆ’ 30 = 450 paid âœ“
    --   09:00â†’17:30  510 min âˆ’ 30 = 480 paid âœ“
    --   06:00â†’14:00  480 min âˆ’ 30 = 450 paid âœ“
    --   08:00â†’16:00  480 min âˆ’ 30 = 450 paid âœ“
    --   14:00â†’22:00  480 min âˆ’ 30 = 450 paid âœ“
    --   16:00â†’00:00  overnight    âˆ’ 30 = 450 paid (stored directly)
    --   22:00â†’06:00  overnight    âˆ’ 30 = 450 paid (stored directly)
    --   08:00â†’12:30  270 min âˆ’ 0  = 270 paid âœ“
    --   13:00â†’17:30  270 min âˆ’ 0  = 270 paid âœ“
    --   07:00â†’20:00  780 min âˆ’ 90 = 690 paid âœ“
    -- ========================================================================
    INSERT INTO master.shift_type (
        id, tenant_id, code, name,
        start_time, end_time, break_minutes, paid_minutes,
        is_overnight, status, created_by
    )
    VALUES
        -- Standard day shift â€” factories, warehouses, call centres
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'day_standard',    'Standard Day Shift',
         '07:00', '15:00', 30, 450, false, 'active', v_su),

        -- Classic office hours â€” the global 9-to-5 equivalent
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'day_office',      'Office Hours Shift',
         '09:00', '17:30', 30, 480, false, 'active', v_su),

        -- Early morning â€” airports, bakeries, distribution centres
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'morning_early',   'Early Morning Shift',
         '06:00', '14:00', 30, 450, false, 'active', v_su),

        -- Mid-day â€” general day production or retail opening
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'day_mid',         'Mid-Day Shift',
         '08:00', '16:00', 30, 450, false, 'active', v_su),

        -- Afternoon â€” overlap shift in multi-shift operations
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'afternoon',       'Afternoon Shift',
         '14:00', '22:00', 30, 450, false, 'active', v_su),

        -- Evening â€” 16:00 to midnight; is_overnight bypasses time-order check
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'evening',         'Evening Shift',
         '16:00', '00:00', 30, 450, true,  'active', v_su),

        -- Night â€” classic graveyard 22:00â†’06:00; is_overnight required
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'night',           'Night Shift',
         '22:00', '06:00', 30, 450, true,  'active', v_su),

        -- Half-day morning â€” part-time, reduced hours, clinics
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'half_day_am',     'Half-Day Morning',
         '08:00', '12:30',  0, 270, false, 'active', v_su),

        -- Half-day afternoon â€” split shifts, school pickups, medical
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'half_day_pm',     'Half-Day Afternoon',
         '13:00', '17:30',  0, 270, false, 'active', v_su),

        -- Extended day â€” long-haul transport, surgeries, field operations
        (md5('wave5:people-payroll:work-schedules:' || v_tid || ':' || nextval('pg_temp.wave5_people_work_seq'))::uuid, v_tid, 'extended_day',    'Extended Day Shift',
         '07:00', '20:00', 90, 690, false, 'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name          = EXCLUDED.name,
            start_time    = EXCLUDED.start_time,
            end_time      = EXCLUDED.end_time,
            break_minutes = EXCLUDED.break_minutes,
            paid_minutes  = EXCLUDED.paid_minutes,
            is_overnight  = EXCLUDED.is_overnight,
            updated_at    = now(),
            updated_by    = v_su
        WHERE (master.shift_type.name, master.shift_type.start_time,
               master.shift_type.end_time, master.shift_type.break_minutes,
               master.shift_type.paid_minutes, master.shift_type.is_overnight)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.start_time,
                                EXCLUDED.end_time, EXCLUDED.break_minutes,
                                EXCLUDED.paid_minutes, EXCLUDED.is_overnight);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] shift_type: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- ASSERTIONS
    -- ========================================================================
    SELECT COUNT(*) INTO v_n FROM master.work_pattern WHERE tenant_id = v_tid;
    IF v_n < 10 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 10 work_pattern rows, found %', v_pack, v_n;
    END IF;

    -- Every work pattern must have day rows matching its cycle_length_days
    PERFORM 1
    FROM master.work_pattern wp
    WHERE wp.tenant_id = v_tid
      AND (SELECT COUNT(*) FROM master.work_pattern_day d
           WHERE d.tenant_id = wp.tenant_id AND d.work_pattern_id = wp.id)
          <> wp.cycle_length_days;
    IF FOUND THEN
        RAISE EXCEPTION '[%] Assertion failed: one or more work_pattern has wrong day-row count', v_pack;
    END IF;

    -- planned_minutes on working days must be positive
    SELECT COUNT(*) INTO v_n
    FROM master.work_pattern_day
    WHERE tenant_id = v_tid
      AND is_working_day = true
      AND planned_minutes <= 0;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[%] Assertion failed: % working days have planned_minutes <= 0', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.shift_type WHERE tenant_id = v_tid;
    IF v_n < 10 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 10 shift_type rows, found %', v_pack, v_n;
    END IF;

    RAISE NOTICE '[%] All assertions passed', v_pack;
    RAISE NOTICE '[%] Summary â€” patterns: %, pattern-days: %, shifts: %',
        v_pack,
        (SELECT COUNT(*) FROM master.work_pattern    WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.work_pattern_day WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.shift_type       WHERE tenant_id = v_tid);

END $seed$;
