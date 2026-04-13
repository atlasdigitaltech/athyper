-- 900_seed_data/001_shared/003_currency.sql
-- Seed: ISO 4217 currencies
-- Schema: shared | Table: currency
--
-- Best-practice notes
-- ───────────────────
-- on conflict (code) do update   → re-running this seed propagates corrections
--                                  (name typos, symbol fixes, minor_units changes)
-- minor_units                    → ISO 4217 authoritative exponent (decimal places)
-- metadata rounding_increment    → actual smallest commercial unit where it differs
--                                  from 10^-minor_units (e.g. CHF rounds to 0.05 cash)
-- PSE omitted                    → not an ISO 4217 currency code (PSE is ISO 3166 country)
-- Precious metals (XAU …)        → minor_units NULL per ISO 4217 (no subunit defined)

-- ============================================================================
-- Major World Currencies
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('USD','US Dollar','$',2,'840','00000000-0000-0000-0000-000000000000'),
  ('EUR','Euro','€',2,'978','00000000-0000-0000-0000-000000000000'),
  ('GBP','Pound Sterling','£',2,'826','00000000-0000-0000-0000-000000000000'),
  ('JPY','Yen','¥',0,'392','00000000-0000-0000-0000-000000000000'),
  ('CNY','Yuan Renminbi','¥',2,'156','00000000-0000-0000-0000-000000000000'),
  ('CHF','Swiss Franc','CHF',2,'756','00000000-0000-0000-0000-000000000000'),
  ('CAD','Canadian Dollar','CA$',2,'124','00000000-0000-0000-0000-000000000000'),
  ('AUD','Australian Dollar','A$',2,'036','00000000-0000-0000-0000-000000000000'),
  ('NZD','New Zealand Dollar','NZ$',2,'554','00000000-0000-0000-0000-000000000000'),
  ('HKD','Hong Kong Dollar','HK$',2,'344','00000000-0000-0000-0000-000000000000'),
  ('SGD','Singapore Dollar','S$',2,'702','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Middle East & North Africa
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('SAR','Saudi Riyal','﷼',2,'682','00000000-0000-0000-0000-000000000000'),
  ('AED','UAE Dirham','د.إ',2,'784','00000000-0000-0000-0000-000000000000'),
  ('BHD','Bahraini Dinar','BD',3,'048','00000000-0000-0000-0000-000000000000'),
  ('KWD','Kuwaiti Dinar','KD',3,'414','00000000-0000-0000-0000-000000000000'),
  ('OMR','Rial Omani','﷼',3,'512','00000000-0000-0000-0000-000000000000'),
  ('QAR','Qatari Rial','QR',2,'634','00000000-0000-0000-0000-000000000000'),
  ('JOD','Jordanian Dinar','JD',3,'400','00000000-0000-0000-0000-000000000000'),
  ('IQD','Iraqi Dinar','ع.د',3,'368','00000000-0000-0000-0000-000000000000'),
  ('LBP','Lebanese Pound','ل.ل',2,'422','00000000-0000-0000-0000-000000000000'),
  ('SYP','Syrian Pound','£S',2,'760','00000000-0000-0000-0000-000000000000'),
  ('YER','Yemeni Rial','﷼',2,'886','00000000-0000-0000-0000-000000000000'),
  ('EGP','Egyptian Pound','E£',2,'818','00000000-0000-0000-0000-000000000000'),
  ('LYD','Libyan Dinar','LD',3,'434','00000000-0000-0000-0000-000000000000'),
  ('TND','Tunisian Dinar','DT',3,'788','00000000-0000-0000-0000-000000000000'),
  ('DZD','Algerian Dinar','د.ج',2,'012','00000000-0000-0000-0000-000000000000'),
  ('MAD','Moroccan Dirham','MAD',2,'504','00000000-0000-0000-0000-000000000000'),
  ('SDG','Sudanese Pound','SDG',2,'938','00000000-0000-0000-0000-000000000000'),
  ('ILS','New Israeli Sheqel','₪',2,'376','00000000-0000-0000-0000-000000000000'),
  ('IRR','Iranian Rial','﷼',2,'364','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Europe (non-EUR)
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('ALL','Albanian Lek','L',2,'008','00000000-0000-0000-0000-000000000000'),
  ('BAM','Convertible Mark','KM',2,'977','00000000-0000-0000-0000-000000000000'),
  ('BGN','Bulgarian Lev','лв',2,'975','00000000-0000-0000-0000-000000000000'),
  ('BYN','Belarusian Ruble','Br',2,'933','00000000-0000-0000-0000-000000000000'),
  ('CZK','Czech Koruna','Kč',2,'203','00000000-0000-0000-0000-000000000000'),
  ('DKK','Danish Krone','kr',2,'208','00000000-0000-0000-0000-000000000000'),
  ('GEL','Georgian Lari','₾',2,'981','00000000-0000-0000-0000-000000000000'),
  ('HRK','Croatian Kuna','kn',2,'191','00000000-0000-0000-0000-000000000000'),
  ('HUF','Hungarian Forint','Ft',2,'348','00000000-0000-0000-0000-000000000000'),
  ('ISK','Iceland Krona','kr',0,'352','00000000-0000-0000-0000-000000000000'),
  ('MDL','Moldovan Leu','L',2,'498','00000000-0000-0000-0000-000000000000'),
  ('MKD','Macedonian Denar','ден',2,'807','00000000-0000-0000-0000-000000000000'),
  ('NOK','Norwegian Krone','kr',2,'578','00000000-0000-0000-0000-000000000000'),
  ('PLN','Polish Zloty','zł',2,'985','00000000-0000-0000-0000-000000000000'),
  ('RON','Romanian Leu','lei',2,'946','00000000-0000-0000-0000-000000000000'),
  ('RSD','Serbian Dinar','din.',2,'941','00000000-0000-0000-0000-000000000000'),
  ('RUB','Russian Ruble','₽',2,'643','00000000-0000-0000-0000-000000000000'),
  ('SEK','Swedish Krona','kr',2,'752','00000000-0000-0000-0000-000000000000'),
  ('TRY','Turkish Lira','₺',2,'949','00000000-0000-0000-0000-000000000000'),
  ('UAH','Ukrainian Hryvnia','₴',2,'980','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Asia & Pacific
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('AFN','Afghan Afghani','؋',2,'971','00000000-0000-0000-0000-000000000000'),
  ('AMD','Armenian Dram','֏',2,'051','00000000-0000-0000-0000-000000000000'),
  ('AZN','Azerbaijan Manat','₼',2,'944','00000000-0000-0000-0000-000000000000'),
  ('BDT','Bangladeshi Taka','৳',2,'050','00000000-0000-0000-0000-000000000000'),
  ('BND','Brunei Dollar','B$',2,'096','00000000-0000-0000-0000-000000000000'),
  ('BTN','Bhutanese Ngultrum','Nu.',2,'064','00000000-0000-0000-0000-000000000000'),
  ('FJD','Fiji Dollar','FJ$',2,'242','00000000-0000-0000-0000-000000000000'),
  ('IDR','Indonesian Rupiah','Rp',2,'360','00000000-0000-0000-0000-000000000000'),
  ('INR','Indian Rupee','₹',2,'356','00000000-0000-0000-0000-000000000000'),
  ('KGS','Kyrgyzstani Som','сом',2,'417','00000000-0000-0000-0000-000000000000'),
  ('KHR','Cambodian Riel','៛',2,'116','00000000-0000-0000-0000-000000000000'),
  ('KPW','North Korean Won','₩',2,'408','00000000-0000-0000-0000-000000000000'),
  ('KRW','South Korean Won','₩',0,'410','00000000-0000-0000-0000-000000000000'),
  ('KZT','Kazakhstani Tenge','₸',2,'398','00000000-0000-0000-0000-000000000000'),
  ('LAK','Lao Kip','₭',2,'418','00000000-0000-0000-0000-000000000000'),
  ('LKR','Sri Lanka Rupee','Rs',2,'144','00000000-0000-0000-0000-000000000000'),
  ('MMK','Myanmar Kyat','K',2,'104','00000000-0000-0000-0000-000000000000'),
  ('MNT','Mongolian Tugrik','₮',2,'496','00000000-0000-0000-0000-000000000000'),
  ('MOP','Macau Pataca','MOP$',2,'446','00000000-0000-0000-0000-000000000000'),
  ('MVR','Maldivian Rufiyaa','Rf',2,'462','00000000-0000-0000-0000-000000000000'),
  ('MYR','Malaysian Ringgit','RM',2,'458','00000000-0000-0000-0000-000000000000'),
  ('NPR','Nepalese Rupee','Rs',2,'524','00000000-0000-0000-0000-000000000000'),
  ('PGK','Papua New Guinean Kina','K',2,'598','00000000-0000-0000-0000-000000000000'),
  ('PHP','Philippine Peso','₱',2,'608','00000000-0000-0000-0000-000000000000'),
  ('PKR','Pakistan Rupee','Rs',2,'586','00000000-0000-0000-0000-000000000000'),
  ('SBD','Solomon Islands Dollar','SI$',2,'090','00000000-0000-0000-0000-000000000000'),
  ('THB','Thai Baht','฿',2,'764','00000000-0000-0000-0000-000000000000'),
  ('TJS','Tajikistani Somoni','SM',2,'972','00000000-0000-0000-0000-000000000000'),
  ('TMT','Turkmenistani Manat','T',2,'934','00000000-0000-0000-0000-000000000000'),
  ('TOP','Tongan Paʻanga','T$',2,'776','00000000-0000-0000-0000-000000000000'),
  ('TWD','New Taiwan Dollar','NT$',2,'901','00000000-0000-0000-0000-000000000000'),
  ('UZS','Uzbekistani Som','сўм',2,'860','00000000-0000-0000-0000-000000000000'),
  ('VND','Vietnamese Dong','₫',0,'704','00000000-0000-0000-0000-000000000000'),
  ('VUV','Vanuatu Vatu','VT',0,'548','00000000-0000-0000-0000-000000000000'),
  ('WST','Samoan Tala','WS$',2,'882','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Africa
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('AOA','Angolan Kwanza','Kz',2,'973','00000000-0000-0000-0000-000000000000'),
  ('BIF','Burundian Franc','FBu',0,'108','00000000-0000-0000-0000-000000000000'),
  ('BWP','Botswana Pula','P',2,'072','00000000-0000-0000-0000-000000000000'),
  ('CDF','Congolese Franc','FC',2,'976','00000000-0000-0000-0000-000000000000'),
  ('CVE','Cabo Verde Escudo','$',2,'132','00000000-0000-0000-0000-000000000000'),
  ('DJF','Djibouti Franc','Fdj',0,'262','00000000-0000-0000-0000-000000000000'),
  ('ERN','Eritrean Nakfa','Nfk',2,'232','00000000-0000-0000-0000-000000000000'),
  ('ETB','Ethiopian Birr','Br',2,'230','00000000-0000-0000-0000-000000000000'),
  ('GHS','Ghana Cedi','GH₵',2,'936','00000000-0000-0000-0000-000000000000'),
  ('GMD','Gambian Dalasi','D',2,'270','00000000-0000-0000-0000-000000000000'),
  ('GNF','Guinean Franc','FG',0,'324','00000000-0000-0000-0000-000000000000'),
  ('KES','Kenyan Shilling','KSh',2,'404','00000000-0000-0000-0000-000000000000'),
  ('KMF','Comorian Franc','CF',0,'174','00000000-0000-0000-0000-000000000000'),
  ('LRD','Liberian Dollar','L$',2,'430','00000000-0000-0000-0000-000000000000'),
  ('LSL','Lesotho Loti','L',2,'426','00000000-0000-0000-0000-000000000000'),
  ('MGA','Malagasy Ariary','Ar',2,'969','00000000-0000-0000-0000-000000000000'),
  ('MRU','Mauritanian Ouguiya','UM',2,'929','00000000-0000-0000-0000-000000000000'),
  ('MUR','Mauritian Rupee','Rs',2,'480','00000000-0000-0000-0000-000000000000'),
  ('MWK','Malawian Kwacha','MK',2,'454','00000000-0000-0000-0000-000000000000'),
  ('MZN','Mozambican Metical','MT',2,'943','00000000-0000-0000-0000-000000000000'),
  ('NAD','Namibia Dollar','N$',2,'516','00000000-0000-0000-0000-000000000000'),
  ('NGN','Nigerian Naira','₦',2,'566','00000000-0000-0000-0000-000000000000'),
  ('RWF','Rwanda Franc','RF',0,'646','00000000-0000-0000-0000-000000000000'),
  ('SCR','Seychelles Rupee','Rs',2,'690','00000000-0000-0000-0000-000000000000'),
  ('SLE','Sierra Leonean Leone','Le',2,'925','00000000-0000-0000-0000-000000000000'),
  ('SOS','Somali Shilling','Sh',2,'706','00000000-0000-0000-0000-000000000000'),
  ('SSP','South Sudanese Pound','£',2,'728','00000000-0000-0000-0000-000000000000'),
  ('STN','São Tomé and Príncipe Dobra','Db',2,'930','00000000-0000-0000-0000-000000000000'),
  ('SZL','Eswatini Lilangeni','E',2,'748','00000000-0000-0000-0000-000000000000'),
  ('TZS','Tanzanian Shilling','TSh',2,'834','00000000-0000-0000-0000-000000000000'),
  ('UGX','Uganda Shilling','USh',0,'800','00000000-0000-0000-0000-000000000000'),
  ('ZAR','South African Rand','R',2,'710','00000000-0000-0000-0000-000000000000'),
  ('ZMW','Zambian Kwacha','ZK',2,'967','00000000-0000-0000-0000-000000000000'),
  ('ZWL','Zimbabwe Dollar','Z$',2,'932','00000000-0000-0000-0000-000000000000'),
  -- ZWG: Zimbabwe Gold — replaced ZWL on 2024-04-05 (ISO 4217 numeric 924)
  ('ZWG','Zimbabwe Gold','ZiG',2,'924','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- HRK: Croatia adopted EUR on 2023-01-01; HRK withdrawn from ISO 4217.
update shared.currency
set status = 'deprecated', updated_at = now(), updated_by = '00000000-0000-0000-0000-000000000000'
where code = 'HRK';

-- ZWL: Zimbabwe replaced ZWL with ZWG on 2024-04-05; ZWL withdrawn from ISO 4217.
update shared.currency
set status = 'deprecated', updated_at = now(), updated_by = '00000000-0000-0000-0000-000000000000'
where code = 'ZWL';

-- ============================================================================
-- CFA Franc Zones & Supranational
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('XAF','CFA Franc BEAC','FCFA',0,'950','00000000-0000-0000-0000-000000000000'),
  ('XOF','CFA Franc BCEAO','CFA',0,'952','00000000-0000-0000-0000-000000000000'),
  ('XCD','East Caribbean Dollar','EC$',2,'951','00000000-0000-0000-0000-000000000000'),
  ('XPF','CFP Franc','₣',0,'953','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Americas (non-USD)
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, created_by)
values
  ('ARS','Argentine Peso','$',2,'032','00000000-0000-0000-0000-000000000000'),
  ('BBD','Barbados Dollar','Bds$',2,'052','00000000-0000-0000-0000-000000000000'),
  ('BMD','Bermudian Dollar','BD$',2,'060','00000000-0000-0000-0000-000000000000'),
  ('BOB','Bolivian Boliviano','Bs.',2,'068','00000000-0000-0000-0000-000000000000'),
  ('BRL','Brazilian Real','R$',2,'986','00000000-0000-0000-0000-000000000000'),
  ('BSD','Bahamian Dollar','B$',2,'044','00000000-0000-0000-0000-000000000000'),
  ('BZD','Belize Dollar','BZ$',2,'084','00000000-0000-0000-0000-000000000000'),
  ('CLP','Chilean Peso','$',0,'152','00000000-0000-0000-0000-000000000000'),
  ('COP','Colombian Peso','$',2,'170','00000000-0000-0000-0000-000000000000'),
  ('CRC','Costa Rican Colon','₡',2,'188','00000000-0000-0000-0000-000000000000'),
  ('CUP','Cuban Peso','$',2,'192','00000000-0000-0000-0000-000000000000'),
  ('DOP','Dominican Peso','RD$',2,'214','00000000-0000-0000-0000-000000000000'),
  ('GTQ','Guatemalan Quetzal','Q',2,'320','00000000-0000-0000-0000-000000000000'),
  ('GYD','Guyana Dollar','GY$',2,'328','00000000-0000-0000-0000-000000000000'),
  ('HNL','Honduran Lempira','L',2,'340','00000000-0000-0000-0000-000000000000'),
  ('HTG','Haiti Gourde','G',2,'332','00000000-0000-0000-0000-000000000000'),
  ('JMD','Jamaican Dollar','J$',2,'388','00000000-0000-0000-0000-000000000000'),
  ('KYD','Cayman Islands Dollar','CI$',2,'136','00000000-0000-0000-0000-000000000000'),
  ('MXN','Mexican Peso','Mex$',2,'484','00000000-0000-0000-0000-000000000000'),
  ('NIO','Nicaraguan Cordoba Oro','C$',2,'558','00000000-0000-0000-0000-000000000000'),
  ('PAB','Panamanian Balboa','B/.',2,'590','00000000-0000-0000-0000-000000000000'),
  ('PEN','Peruvian Sol','S/.',2,'604','00000000-0000-0000-0000-000000000000'),
  ('PYG','Paraguayan Guarani','₲',0,'600','00000000-0000-0000-0000-000000000000'),
  ('SRD','Surinam Dollar','$',2,'968','00000000-0000-0000-0000-000000000000'),
  ('TTD','Trinidad and Tobago Dollar','TT$',2,'780','00000000-0000-0000-0000-000000000000'),
  ('UYU','Uruguayan Peso','$U',2,'858','00000000-0000-0000-0000-000000000000'),
  ('VES','Venezuelan Bolívar Soberano','Bs.S',2,'928','00000000-0000-0000-0000-000000000000'),
  ('AWG','Aruban Florin','ƒ',2,'533','00000000-0000-0000-0000-000000000000'),
  ('ANG','Netherlands Antillean Guilder','ƒ',2,'532','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Special / Precious Metals (valid ISO 4217)
-- minor_units intentionally NULL — ISO 4217 defines no subunit for metals/SDR
-- ============================================================================
insert into shared.currency (code, name, symbol, minor_units, numeric3, status, created_by)
values
  ('XAU','Gold (troy ounce)',null,null,'959','active','00000000-0000-0000-0000-000000000000'),
  ('XAG','Silver (troy ounce)',null,null,'961','active','00000000-0000-0000-0000-000000000000'),
  ('XPT','Platinum (troy ounce)',null,null,'962','active','00000000-0000-0000-0000-000000000000'),
  ('XPD','Palladium (troy ounce)',null,null,'964','active','00000000-0000-0000-0000-000000000000'),
  ('XDR','Special Drawing Rights (SDR)',null,null,'960','active','00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name        = excluded.name,
  symbol      = excluded.symbol,
  minor_units = excluded.minor_units,
  numeric3    = excluded.numeric3,
  updated_at  = now(),
  updated_by  = excluded.created_by;

-- ============================================================================
-- Financial Rounding Metadata
-- ============================================================================
-- Applied after inserts so they do not interfere with the idempotent upsert above.
-- Only currencies where the commercial rounding increment differs from
-- the ISO 4217 implied value (10^-minor_units) receive an explicit entry.
-- merge into existing metadata so other keys are preserved.

-- CHF: Swiss National Bank mandates cash rounding to 0.05 (5 Rappen).
-- Electronic / interbank transactions still settle at 0.01.
update shared.currency
set metadata = metadata || '{"rounding_increment": "0.05", "cash_rounding": "0.05", "electronic_rounding": "0.01"}'::jsonb
where code = 'CHF';

-- HUF: ISO 4217 minor_units=2 but the fillér has not been in circulation since 1999.
-- All retail and B2B transactions round to the nearest whole forint (1 HUF).
update shared.currency
set metadata = metadata || '{"rounding_increment": "1", "practical_minor_units": 0, "note": "fillér not in circulation; round to whole HUF"}'::jsonb
where code = 'HUF';

-- IDR: ISO 4217 minor_units=2 but the sen subunit is obsolete.
-- Transactions are routinely expressed in whole rupiah; amounts < 1 IDR do not occur.
update shared.currency
set metadata = metadata || '{"rounding_increment": "1", "practical_minor_units": 0, "note": "sen subunit obsolete; round to whole IDR"}'::jsonb
where code = 'IDR';

-- TWD: ISO 4217 minor_units=2; in practice the jiao/fen are not used commercially.
-- Most POS systems and invoices display whole New Taiwan Dollar amounts.
update shared.currency
set metadata = metadata || '{"rounding_increment": "1", "practical_minor_units": 0, "note": "fen subunit not used commercially"}'::jsonb
where code = 'TWD';

-- COP: ISO 4217 minor_units=2; since 2018 Colombia rounds retail transactions to 50 pesos.
-- The centavo has been effectively out of use since the 1990s.
update shared.currency
set metadata = metadata || '{"rounding_increment": "50", "practical_minor_units": 0, "note": "centavo obsolete; retail rounds to 50 COP"}'::jsonb
where code = 'COP';

-- MGA: ISO 4217 minor_units=2; 1 Ariary = 5 iraimbilanja (not 100).
-- The subunit does not follow a decimal scale — store whole Ariary in practice.
update shared.currency
set metadata = metadata || '{"rounding_increment": "1", "practical_minor_units": 0, "note": "1 Ariary = 5 iraimbilanja (non-decimal subunit)"}'::jsonb
where code = 'MGA';

-- MRU: ISO 4217 minor_units=2; 1 Ouguiya = 5 khoums (not 100).
-- Same non-decimal subunit pattern as MGA.
update shared.currency
set metadata = metadata || '{"rounding_increment": "1", "practical_minor_units": 0, "note": "1 Ouguiya = 5 khoums (non-decimal subunit)"}'::jsonb
where code = 'MRU';
