-- 900_seed_data/001_shared/007_uom.sql
-- Seed: UN/ECE Rec 20 units of measure
-- Schema: shared | Table: uom
--
-- Best-practice notes
-- ───────────────────
-- quantity_type values must exist in control.lookup_value (domain: shared.uom_quantity_type).
-- on conflict do update → re-running propagates name/symbol/quantity_type corrections.
-- Codes follow UN/ECE Recommendation 20 where available; custom codes noted inline.
-- BA note: UN/ECE Rec 20 code BA = "Ball" (textile/sports), not "Barrel". The entry
--   below uses BA as a container/drum barrel (packaging context). Application code
--   should distinguish from BLL (Barrel, petroleum, volume). Consider migrating to
--   a custom code (e.g. DRM for drum) in a future revision.
-- YDQ removed: not a UN/ECE code and duplicates CYD (Cubic Yard, yd³).
-- TNK: classified as 'service' (transport KPI), not 'quantity'.
-- MYR: Man-year code collides with ISO 4217 MYR (Malaysian Ringgit) — different tables,
--   but application code that resolves UOM codes should be aware of this overlap.
-- NULL symbol policy
--   Some UOM codes carry a NULL symbol because no internationally standardised
--   abbreviation exists for that unit. Two categories apply here:
--   • Composite groupings (SET, KIT): their "size" is defined by their contents,
--     not by the grouping concept itself; no standard symbol is defined in UN/ECE
--     Rec 20 or any ISO standard.
--   • Variable-dimension containers (PK, BX, CT, CS, PL, RL, SH, BA): physical
--     dimensions vary by product and supplier, so a fixed symbol would be
--     misleading (e.g. a "box" can be 0.1 kg or 50 kg). Rendering code must
--     treat NULL symbol as "display name only" — show the UOM name instead.

-- ============================================================================
-- quantity — Count / Dimensionless
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('C62','One (unit)','1','quantity','00000000-0000-0000-0000-000000000000'),
  ('EA','Each','ea','quantity','00000000-0000-0000-0000-000000000000'),
  ('PR','Pair','pr','quantity','00000000-0000-0000-0000-000000000000'),
  ('DZN','Dozen','doz','quantity','00000000-0000-0000-0000-000000000000'),
  ('GRO','Gross','gr','quantity','00000000-0000-0000-0000-000000000000'),
  -- symbol NULL: composite groupings — contents define the unit, no standard abbreviation
  ('SET','Set',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('KIT','Kit',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('LOT','Lot','lot','quantity','00000000-0000-0000-0000-000000000000'),
  -- symbol NULL: variable-dimension containers — physical size varies by product/supplier
  ('PK','Pack',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('BX','Box',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('CT','Carton',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('CS','Case',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('PL','Pallet',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('RL','Roll',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('SH','Sheet',null,'quantity','00000000-0000-0000-0000-000000000000'),
  ('BA','Barrel',null,'quantity','00000000-0000-0000-0000-000000000000'),  -- see BA note above re: UN/ECE code collision
  ('AB','Container','cntr','quantity','00000000-0000-0000-0000-000000000000'),
  ('E30','Trailer','trlr','quantity','00000000-0000-0000-0000-000000000000'),
  ('NL','Load','load','quantity','00000000-0000-0000-0000-000000000000'),
  ('E85','TEU (Twenty-foot Equivalent Unit)','TEU','quantity','00000000-0000-0000-0000-000000000000'),
  ('TNK','Tonne-kilometre','t·km','service','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- mass — Weight
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('MC','Microgram','µg','mass','00000000-0000-0000-0000-000000000000'),
  ('CGM','Centigram','cg','mass','00000000-0000-0000-0000-000000000000'),
  ('MGM','Milligram','mg','mass','00000000-0000-0000-0000-000000000000'),
  ('GRM','Gram','g','mass','00000000-0000-0000-0000-000000000000'),
  ('KGM','Kilogram','kg','mass','00000000-0000-0000-0000-000000000000'),
  ('DTN','Decitonne','dt','mass','00000000-0000-0000-0000-000000000000'),
  ('TNE','Metric Ton (Tonne)','t','mass','00000000-0000-0000-0000-000000000000'),
  ('ONZ','Ounce','oz','mass','00000000-0000-0000-0000-000000000000'),
  ('APZ','Troy Ounce','oz t','mass','00000000-0000-0000-0000-000000000000'),
  ('LBR','Pound','lb','mass','00000000-0000-0000-0000-000000000000'),
  ('CWA','Hundredweight (US)','cwt','mass','00000000-0000-0000-0000-000000000000'),
  ('STN','Short Ton (US)','sh tn','mass','00000000-0000-0000-0000-000000000000'),
  ('LTN','Long Ton (UK)','l tn','mass','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- length — Distance
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('A11','Micrometre','µm','length','00000000-0000-0000-0000-000000000000'),
  ('MMT','Millimetre','mm','length','00000000-0000-0000-0000-000000000000'),
  ('CMT','Centimetre','cm','length','00000000-0000-0000-0000-000000000000'),
  ('DMT','Decimetre','dm','length','00000000-0000-0000-0000-000000000000'),
  ('MTR','Metre','m','length','00000000-0000-0000-0000-000000000000'),
  ('KMT','Kilometre','km','length','00000000-0000-0000-0000-000000000000'),
  ('INH','Inch','in','length','00000000-0000-0000-0000-000000000000'),
  ('FOT','Foot','ft','length','00000000-0000-0000-0000-000000000000'),
  ('LF','Linear Foot','lin ft','length','00000000-0000-0000-0000-000000000000'),
  ('LM','Linear Metre','lin m','length','00000000-0000-0000-0000-000000000000'),
  ('YRD','Yard','yd','length','00000000-0000-0000-0000-000000000000'),
  ('SMI','Statute Mile','mi','length','00000000-0000-0000-0000-000000000000'),
  ('NMI','Nautical Mile','nmi','length','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- area — Surface
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('INK','Square Inch','in²','area','00000000-0000-0000-0000-000000000000'),
  ('FTK','Square Foot','ft²','area','00000000-0000-0000-0000-000000000000'),
  ('YDK','Square Yard','yd²','area','00000000-0000-0000-0000-000000000000'),
  ('CMK','Square Centimetre','cm²','area','00000000-0000-0000-0000-000000000000'),
  ('MTK','Square Metre','m²','area','00000000-0000-0000-0000-000000000000'),
  ('KMK','Square Kilometre','km²','area','00000000-0000-0000-0000-000000000000'),
  ('HAR','Hectare','ha','area','00000000-0000-0000-0000-000000000000'),
  ('ACR','Acre','ac','area','00000000-0000-0000-0000-000000000000'),
  ('SQR','Square (roofing, 100 ft²)','sq','area','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- volume — Capacity
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('MLT','Millilitre','mL','volume','00000000-0000-0000-0000-000000000000'),
  ('CLT','Centilitre','cL','volume','00000000-0000-0000-0000-000000000000'),
  ('DLT','Decilitre','dL','volume','00000000-0000-0000-0000-000000000000'),
  ('LTR','Litre','L','volume','00000000-0000-0000-0000-000000000000'),
  ('HLT','Hectolitre','hL','volume','00000000-0000-0000-0000-000000000000'),
  ('CMQ','Cubic Centimetre','cm³','volume','00000000-0000-0000-0000-000000000000'),
  ('DMQ','Cubic Decimetre','dm³','volume','00000000-0000-0000-0000-000000000000'),
  ('MTQ','Cubic Metre','m³','volume','00000000-0000-0000-0000-000000000000'),
  ('INQ','Cubic Inch','in³','volume','00000000-0000-0000-0000-000000000000'),
  ('FTQ','Cubic Foot','ft³','volume','00000000-0000-0000-0000-000000000000'),
  ('GLL','Gallon (US)','gal','volume','00000000-0000-0000-0000-000000000000'),
  ('GLI','Gallon (UK)','gal','volume','00000000-0000-0000-0000-000000000000'),
  ('QTI','Quart (US)','qt','volume','00000000-0000-0000-0000-000000000000'),
  ('PTI','Pint (US)','pt','volume','00000000-0000-0000-0000-000000000000'),
  ('OZA','Fluid Ounce (US)','fl oz','volume','00000000-0000-0000-0000-000000000000'),
  ('BLL','Barrel (US petroleum)','bbl','volume','00000000-0000-0000-0000-000000000000'),
  -- CYD is the canonical UN/ECE code for cubic yard; YDQ was removed (not UN/ECE, duplicated CYD)
  ('CYD','Cubic Yard','yd³','volume','00000000-0000-0000-0000-000000000000'),
  ('BFT','Board Foot','bd ft','volume','00000000-0000-0000-0000-000000000000'),
  ('MBF','Thousand Board Feet','MBF','volume','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- time — Duration
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('SEC','Second','s','time','00000000-0000-0000-0000-000000000000'),
  ('MIN','Minute','min','time','00000000-0000-0000-0000-000000000000'),
  ('HUR','Hour','h','time','00000000-0000-0000-0000-000000000000'),
  ('DAY','Day','d','time','00000000-0000-0000-0000-000000000000'),
  ('WEE','Week','wk','time','00000000-0000-0000-0000-000000000000'),
  ('MON','Month','mo','time','00000000-0000-0000-0000-000000000000'),
  ('QAN','Quarter','qtr','time','00000000-0000-0000-0000-000000000000'),
  ('ANN','Year','yr','time','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- temperature
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('CEL','Degree Celsius','°C','temperature','00000000-0000-0000-0000-000000000000'),
  ('FAH','Degree Fahrenheit','°F','temperature','00000000-0000-0000-0000-000000000000'),
  ('KEL','Kelvin','K','temperature','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- speed — Velocity
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('MTS','Metre per Second','m/s','speed','00000000-0000-0000-0000-000000000000'),
  ('KMH','Kilometre per Hour','km/h','speed','00000000-0000-0000-0000-000000000000'),
  ('HM','Mile per Hour','mph','speed','00000000-0000-0000-0000-000000000000'),
  ('KNT','Knot','kn','speed','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- force
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('NEW','Newton','N','force','00000000-0000-0000-0000-000000000000'),
  ('KGF','Kilogram-force','kgf','force','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- pressure
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('PAL','Pascal','Pa','pressure','00000000-0000-0000-0000-000000000000'),
  ('KPA','Kilopascal','kPa','pressure','00000000-0000-0000-0000-000000000000'),
  ('MPA','Megapascal','MPa','pressure','00000000-0000-0000-0000-000000000000'),
  ('BAR','Bar','bar','pressure','00000000-0000-0000-0000-000000000000'),
  ('ATM','Standard Atmosphere','atm','pressure','00000000-0000-0000-0000-000000000000'),
  ('PS','Pound per Square Inch','psi','pressure','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- energy
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('JOU','Joule','J','energy','00000000-0000-0000-0000-000000000000'),
  ('KJO','Kilojoule','kJ','energy','00000000-0000-0000-0000-000000000000'),
  ('WHR','Watt-hour','Wh','energy','00000000-0000-0000-0000-000000000000'),
  ('KWH','Kilowatt-hour','kWh','energy','00000000-0000-0000-0000-000000000000'),
  ('MWH','Megawatt-hour','MWh','energy','00000000-0000-0000-0000-000000000000'),
  ('BTU','British Thermal Unit','BTU','energy','00000000-0000-0000-0000-000000000000'),
  ('A53','Electronvolt','eV','energy','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- power
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('WTT','Watt','W','power','00000000-0000-0000-0000-000000000000'),
  ('KWT','Kilowatt','kW','power','00000000-0000-0000-0000-000000000000'),
  ('MAW','Megawatt','MW','power','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- electrical
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('AMP','Ampere','A','electrical','00000000-0000-0000-0000-000000000000'),
  ('B22','Kiloampere','kA','electrical','00000000-0000-0000-0000-000000000000'),
  ('VLT','Volt','V','electrical','00000000-0000-0000-0000-000000000000'),
  ('KVT','Kilovolt','kV','electrical','00000000-0000-0000-0000-000000000000'),
  ('OHM','Ohm','Ω','electrical','00000000-0000-0000-0000-000000000000'),
  ('FAR','Farad','F','electrical','00000000-0000-0000-0000-000000000000'),
  ('B69','Microfarad','µF','electrical','00000000-0000-0000-0000-000000000000'),
  ('D10','Siemens','S','electrical','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- frequency
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('HTZ','Hertz','Hz','frequency','00000000-0000-0000-0000-000000000000'),
  ('KHZ','Kilohertz','kHz','frequency','00000000-0000-0000-0000-000000000000'),
  ('MHZ','Megahertz','MHz','frequency','00000000-0000-0000-0000-000000000000'),
  ('A86','Gigahertz','GHz','frequency','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- density
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('KMQ','Kilogram per Cubic Metre','kg/m³','density','00000000-0000-0000-0000-000000000000'),
  ('GL','Gram per Litre','g/L','density','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- digital — Data
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('E68','Bit','bit','digital','00000000-0000-0000-0000-000000000000'),
  ('AD','Byte','B','digital','00000000-0000-0000-0000-000000000000'),
  ('E36','Kilobyte','KB','digital','00000000-0000-0000-0000-000000000000'),
  ('4L','Megabyte','MB','digital','00000000-0000-0000-0000-000000000000'),
  ('E34','Gigabyte','GB','digital','00000000-0000-0000-0000-000000000000'),
  ('E35','Terabyte','TB','digital','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- angle
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('DD','Degree (angle)','°','angle','00000000-0000-0000-0000-000000000000'),
  ('RAD','Radian','rad','angle','00000000-0000-0000-0000-000000000000'),
  ('D61','Minute (angle)','''','angle','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- service — Labour, Manpower, IT, Logistics, Billing
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  -- Labour / Manpower
  ('MHR','Man-hour','man·h','service','00000000-0000-0000-0000-000000000000'),
  ('DAD','Man-day','man·d','service','00000000-0000-0000-0000-000000000000'),
  ('MMN','Man-month','man·mo','service','00000000-0000-0000-0000-000000000000'),
  ('MYR','Man-year','man·a','service','00000000-0000-0000-0000-000000000000'),
  ('FTE','Full-Time Equivalent','FTE','service','00000000-0000-0000-0000-000000000000'),
  ('E65','Resource-hour','res·h','service','00000000-0000-0000-0000-000000000000'),
  ('E66','Person-day','pd','service','00000000-0000-0000-0000-000000000000'),
  ('E67','Person-month','pm','service','00000000-0000-0000-0000-000000000000'),
  -- General service
  ('LS','Lump Sum','LS','service','00000000-0000-0000-0000-000000000000'),
  ('E09','Job','job','service','00000000-0000-0000-0000-000000000000'),
  ('ACT','Activity','act','service','00000000-0000-0000-0000-000000000000'),
  ('E27','Dose','dose','service','00000000-0000-0000-0000-000000000000'),
  -- Logistics / Transport
  ('E99','Trip','trip','service','00000000-0000-0000-0000-000000000000'),
  ('E91','Shipment','shpmt','service','00000000-0000-0000-0000-000000000000'),
  ('E92','Delivery','dlvy','service','00000000-0000-0000-0000-000000000000'),
  ('E86','Consignment','csgn','service','00000000-0000-0000-0000-000000000000'),
  -- Subscription / Rental / Billing
  ('E48','User','user','service','00000000-0000-0000-0000-000000000000'),
  ('E49','Seat','seat','service','00000000-0000-0000-0000-000000000000'),
  ('E50','Licence','lic','service','00000000-0000-0000-0000-000000000000'),
  ('E51','Transaction','txn','service','00000000-0000-0000-0000-000000000000'),
  ('E52','API Call','call','service','00000000-0000-0000-0000-000000000000'),
  ('E53','Message','msg','service','00000000-0000-0000-0000-000000000000'),
  ('E54','Request','req','service','00000000-0000-0000-0000-000000000000'),
  ('E55','Credit','cr','service','00000000-0000-0000-0000-000000000000'),
  ('E56','Token','tkn','service','00000000-0000-0000-0000-000000000000'),
  -- IT Services
  ('SPR','Sprint','sprint','service','00000000-0000-0000-0000-000000000000'),
  ('STP','Story Point','SP','service','00000000-0000-0000-0000-000000000000'),
  ('E57','Incident','inc','service','00000000-0000-0000-0000-000000000000'),
  ('E58','Ticket','tkt','service','00000000-0000-0000-0000-000000000000'),
  ('E59','Service Request','SR','service','00000000-0000-0000-0000-000000000000'),
  ('E60','Change Request','CR','service','00000000-0000-0000-0000-000000000000'),
  ('E61','Environment','env','service','00000000-0000-0000-0000-000000000000'),
  ('E62','Instance','inst','service','00000000-0000-0000-0000-000000000000'),
  ('E63','Deployment','dply','service','00000000-0000-0000-0000-000000000000'),
  ('E64','Build','bld','service','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- ratio — Dimensionless
-- Pure ratios with no physical dimension. P1 is the UN/ECE Rec 20 code for
-- percent and is the primary dimensionless ratio unit.
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('P1', 'Percent',             '%',     'ratio', '00000000-0000-0000-0000-000000000000'),
  ('GK', 'Gram per Kilogram',   'g/kg',  'ratio', '00000000-0000-0000-0000-000000000000'),
  ('GP', 'Gram per 100 Gram',   'g/100g','ratio', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- concentration — Amount per unit volume or mass
-- Used in chemistry, pharmaceuticals, food safety, and environmental reporting.
-- UN/ECE Rec 20 codes where available; MGL/C37 are standard.
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('MRL', 'Milligram per Litre',        'mg/L',   'concentration', '00000000-0000-0000-0000-000000000000'),
  ('C37', 'Milligram per Gram',          'mg/g',   'concentration', '00000000-0000-0000-0000-000000000000'),
  ('M29', 'Microgram per Litre',         'µg/L',   'concentration', '00000000-0000-0000-0000-000000000000'),
  ('M30', 'Milligram per Cubic Metre',   'mg/m³',  'concentration', '00000000-0000-0000-0000-000000000000'),
  -- PPM / PPB: not in UN/ECE Rec 20; custom codes for parts-per notation
  ('PPM', 'Part per Million',            'ppm',    'concentration', '00000000-0000-0000-0000-000000000000'),
  ('PPB', 'Part per Billion',            'ppb',    'concentration', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- ============================================================================
-- luminosity — Light intensity and flux
-- UN/ECE Rec 20 codes: B52 (candela), B55 (lumen), B62 (lux).
-- ============================================================================
insert into shared.uom (code, name, symbol, quantity_type, created_by)
values
  ('B52', 'Candela',             'cd',   'luminosity', '00000000-0000-0000-0000-000000000000'),
  ('B55', 'Lumen',               'lm',   'luminosity', '00000000-0000-0000-0000-000000000000'),
  ('B62', 'Lux',                 'lx',   'luminosity', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  symbol        = excluded.symbol,
  quantity_type = excluded.quantity_type,
  updated_at    = now(),
  updated_by    = excluded.created_by;
