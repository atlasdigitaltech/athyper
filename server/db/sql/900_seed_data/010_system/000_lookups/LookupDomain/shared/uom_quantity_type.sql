-- LookupDomain/shared/uom_quantity_type.sql
-- Lookup values for domain: shared.uom_quantity_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- ── Fundamental physical quantities ──────────────────────────────────────
    ('mass', 'Mass',
     'shared.uom_quantity_type',
     'Measure of matter. Base SI unit: kilogram (KGM). Codes: KGM, GRM, TNE, LBR, ONZ.',
     10),
    ('length', 'Length',
     'shared.uom_quantity_type',
     'Linear distance. Base SI unit: metre (MTR). Codes: MTR, CMT, MMT, KMT, INH, FOT, SMI.',
     20),
    ('area', 'Area',
     'shared.uom_quantity_type',
     'Two-dimensional extent. Base SI unit: square metre (MTK). Codes: MTK, CMK, HAR, ACR.',
     30),
    ('volume', 'Volume',
     'shared.uom_quantity_type',
     'Three-dimensional capacity. Base SI unit: cubic metre (MTQ). Codes: MTQ, LTR, MLT, GLL, OZA.',
     40),
    ('time', 'Time',
     'shared.uom_quantity_type',
     'Duration. Base SI unit: second (SEC). Codes: SEC, MIN, HUR, DAY, WEE, MON, ANN.',
     50),
    ('temperature', 'Temperature',
     'shared.uom_quantity_type',
     'Thermal state. Base SI unit: kelvin (KEL). Codes: KEL, CEL, FAH.',
     60),

    -- ── Derived physical quantities ───────────────────────────────────────────
    ('speed', 'Speed / Velocity',
     'shared.uom_quantity_type',
     'Distance per time. Codes: MTS (m/s), KMH (km/h), KNT (knot), HM (mph).',
     70),
    ('force', 'Force',
     'shared.uom_quantity_type',
     'Mass × acceleration. Base SI unit: newton (NEW). Codes: NEW, KGF.',
     80),
    ('pressure', 'Pressure',
     'shared.uom_quantity_type',
     'Force per area. Base SI unit: pascal (PAL). Codes: PAL, KPA, MPA, BAR, ATM, PS (psi).',
     90),
    ('energy', 'Energy',
     'shared.uom_quantity_type',
     'Capacity to do work. Base SI unit: joule (JOU). Codes: JOU, KJO, WHR, KWH, MWH, BTU, A53.',
     100),
    ('power', 'Power',
     'shared.uom_quantity_type',
     'Energy per time. Base SI unit: watt (WTT). Codes: WTT, KWT, MAW.',
     110),
    ('electrical', 'Electrical',
     'shared.uom_quantity_type',
     'Electromagnetic quantities. Codes: AMP, B22 (kA), VLT, KVT, OHM, FAR, B69 (µF), D10 (S).',
     120),
    ('frequency', 'Frequency',
     'shared.uom_quantity_type',
     'Cycles per second. Base SI unit: hertz (HTZ). Codes: HTZ, KHZ, MHZ, A86 (GHz).',
     130),
    ('density', 'Density',
     'shared.uom_quantity_type',
     'Mass per volume. Codes: KMQ (kg/m³), GL (g/L).',
     140),
    ('concentration', 'Concentration',
     'shared.uom_quantity_type',
     'Amount per unit volume or mass. Codes: P1 (%), ppm, ppb, mg/L.',
     150),
    ('luminosity', 'Luminosity',
     'shared.uom_quantity_type',
     'Light intensity/flux. Codes: LUX (lux), lumen, candela.',
     160),
    ('angle', 'Angle',
     'shared.uom_quantity_type',
     'Geometric angle. Codes: DD (degree), RAD (radian), D61 (minute of arc).',
     170),

    -- ── Count and dimensionless ───────────────────────────────────────────────
    ('quantity', 'Quantity / Count',
     'shared.uom_quantity_type',
     'Dimensionless discrete count. Codes: C62 (one), EA (each), PR, DZN, GRO, SET, PK, BX, CT, CS, PL, RL, SH, BA.',
     180),
    ('ratio', 'Ratio / Dimensionless',
     'shared.uom_quantity_type',
     'Pure ratio with no physical dimension. Codes: P1 (%), C62 (one), GK (g/kg).',
     190),

    -- ── Digital / data ────────────────────────────────────────────────────────
    ('digital', 'Digital Data',
     'shared.uom_quantity_type',
     'Information quantity. Codes: E68 (bit), AD (byte), E36 (KB), 4L (MB), E34 (GB), E35 (TB).',
     200),

    -- ── Financial ─────────────────────────────────────────────────────────────
    ('currency', 'Currency / Monetary',
     'shared.uom_quantity_type',
     'Monetary amount. UoM code = ISO 4217 currency code (e.g. MYR, USD, EUR). FK: shared.currency.',
     210),

    -- ── Service / Labour / IT ─────────────────────────────────────────────────
    -- REQUIRED: used by shared.uom entries for labour, subscription, logistics,
    -- and IT service billing units. Must be present before uom seed runs.
    ('service', 'Service / Labour / IT',
     'shared.uom_quantity_type',
     'Work-based, subscription, and IT service units. Codes: MHR (man-hour), DAD (man-day), FTE, LS (lump sum), E48 (user), E49 (seat), E50 (licence), E51 (transaction), E52 (API call), SPR (sprint), STP (story point), E99 (trip), E91 (shipment), TNK (tonne-km).',
     220)

) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
