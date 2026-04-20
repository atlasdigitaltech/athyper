-- 900_seed_data/001_shared/006_timezone.sql
-- Seed: IANA tzdb time zones
-- Schema: shared | Table: timezone
--
-- Best-practice notes
-- ───────────────────
-- utc_offset_minutes  → standard (non-DST) offset. DST-observing zones should
--   use AT TIME ZONE at query time; the stored offset is for reference/display.
-- is_alias / canonical_code → alias entries point to their canonical IANA code.
--   Always insert canonicals before aliases so application code can resolve them.
-- on conflict do update → re-running propagates name fixes and offset corrections.
-- IANA 2020b: America/Godthab renamed → America/Nuuk (canonical). Godthab → alias.
-- IANA 2022b: Europe/Kiev renamed → Europe/Kyiv (canonical). Kiev → alias.
-- IANA 2022g: America/Ciudad_Juarez added (UTC-7 year-round, no DST).
-- US/Hawaii fix: correct canonical is Pacific/Honolulu, not America/Adak.

-- ============================================================================
-- Etc (must come first — referenced by GMT/UTC aliases)
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Etc/GMT','GMT',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Etc/UTC','UTC',0,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Africa
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Africa/Abidjan','Africa / Abidjan',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Accra','Africa / Accra',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Addis_Ababa','Africa / Addis Ababa',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Algiers','Africa / Algiers',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Asmara','Africa / Asmara',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Bamako','Africa / Bamako',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Bangui','Africa / Bangui',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Banjul','Africa / Banjul',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Bissau','Africa / Bissau',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Blantyre','Africa / Blantyre',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Brazzaville','Africa / Brazzaville',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Bujumbura','Africa / Bujumbura',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Cairo','Africa / Cairo',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Casablanca','Africa / Casablanca',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Ceuta','Africa / Ceuta',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Conakry','Africa / Conakry',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Dakar','Africa / Dakar',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Dar_es_Salaam','Africa / Dar es Salaam',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Djibouti','Africa / Djibouti',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Douala','Africa / Douala',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/El_Aaiun','Africa / El Aaiun',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Freetown','Africa / Freetown',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Gaborone','Africa / Gaborone',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Harare','Africa / Harare',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Johannesburg','Africa / Johannesburg',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Juba','Africa / Juba',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Kampala','Africa / Kampala',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Khartoum','Africa / Khartoum',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Kigali','Africa / Kigali',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Kinshasa','Africa / Kinshasa',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Lagos','Africa / Lagos',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Libreville','Africa / Libreville',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Lome','Africa / Lome',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Luanda','Africa / Luanda',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Lubumbashi','Africa / Lubumbashi',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Lusaka','Africa / Lusaka',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Malabo','Africa / Malabo',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Maputo','Africa / Maputo',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Maseru','Africa / Maseru',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Mbabane','Africa / Mbabane',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Mogadishu','Africa / Mogadishu',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Monrovia','Africa / Monrovia',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Nairobi','Africa / Nairobi',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Ndjamena','Africa / Ndjamena',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Niamey','Africa / Niamey',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Nouakchott','Africa / Nouakchott',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Ouagadougou','Africa / Ouagadougou',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Porto-Novo','Africa / Porto-Novo',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Sao_Tome','Africa / Sao Tome',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Tripoli','Africa / Tripoli',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Tunis','Africa / Tunis',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Africa/Windhoek','Africa / Windhoek',120,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- America
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('America/Adak','America / Adak',-600,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Anchorage','America / Anchorage',-540,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Anguilla','America / Anguilla',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Antigua','America / Antigua',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Araguaina','America / Araguaina',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Argentina/Buenos_Aires','America / Buenos Aires',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Argentina/Cordoba','America / Cordoba',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Argentina/Salta','America / Salta',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Aruba','America / Aruba',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Asuncion','America / Asuncion',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Atikokan','America / Atikokan',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Bahia','America / Bahia',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Barbados','America / Barbados',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Belem','America / Belem',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Belize','America / Belize',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Bogota','America / Bogota',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Boise','America / Boise',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Cambridge_Bay','America / Cambridge Bay',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Campo_Grande','America / Campo Grande',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Cancun','America / Cancun',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Caracas','America / Caracas',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Cayenne','America / Cayenne',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Cayman','America / Cayman',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Chicago','America / Chicago',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Chihuahua','America / Chihuahua',-360,false,'00000000-0000-0000-0000-000000000000'),
  -- Added IANA 2022g: Ciudad Juárez observes MST year-round (no DST) after 2022
  ('America/Ciudad_Juarez','America / Ciudad Juarez',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Costa_Rica','America / Costa Rica',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Cuiaba','America / Cuiaba',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Curacao','America / Curacao',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Dawson','America / Dawson',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Dawson_Creek','America / Dawson Creek',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Denver','America / Denver',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Detroit','America / Detroit',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Dominica','America / Dominica',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Edmonton','America / Edmonton',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/El_Salvador','America / El Salvador',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Fortaleza','America / Fortaleza',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Grand_Turk','America / Grand Turk',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Grenada','America / Grenada',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Guadeloupe','America / Guadeloupe',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Guatemala','America / Guatemala',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Guayaquil','America / Guayaquil',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Guyana','America / Guyana',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Halifax','America / Halifax',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Havana','America / Havana',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Hermosillo','America / Hermosillo',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Indiana/Indianapolis','America / Indianapolis',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Iqaluit','America / Iqaluit',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Jamaica','America / Jamaica',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Juneau','America / Juneau',-540,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Kentucky/Louisville','America / Louisville',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/La_Paz','America / La Paz',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Lima','America / Lima',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Los_Angeles','America / Los Angeles',-480,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Managua','America / Managua',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Manaus','America / Manaus',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Martinique','America / Martinique',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Mazatlan','America / Mazatlan',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Mexico_City','America / Mexico City',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Miquelon','America / Miquelon',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Moncton','America / Moncton',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Monterrey','America / Monterrey',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Montevideo','America / Montevideo',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Montserrat','America / Montserrat',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Nassau','America / Nassau',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/New_York','America / New York',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Nipigon','America / Nipigon',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Nome','America / Nome',-540,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Noronha','America / Noronha',-120,false,'00000000-0000-0000-0000-000000000000'),
  -- IANA 2020b canonical for Greenland; Godthab retained as alias below
  ('America/Nuuk','America / Nuuk',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Panama','America / Panama',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Paramaribo','America / Paramaribo',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Phoenix','America / Phoenix',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Port-au-Prince','America / Port-au-Prince',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Port_of_Spain','America / Port of Spain',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Puerto_Rico','America / Puerto Rico',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Rankin_Inlet','America / Rankin Inlet',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Recife','America / Recife',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Regina','America / Regina',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Rio_Branco','America / Rio Branco',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Santiago','America / Santiago',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Santo_Domingo','America / Santo Domingo',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Sao_Paulo','America / Sao Paulo',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('America/St_Johns','America / St. John''s',-210,false,'00000000-0000-0000-0000-000000000000'),
  ('America/St_Kitts','America / St. Kitts',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/St_Lucia','America / St. Lucia',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/St_Vincent','America / St. Vincent',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Tegucigalpa','America / Tegucigalpa',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Thule','America / Thule',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Thunder_Bay','America / Thunder Bay',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Tijuana','America / Tijuana',-480,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Toronto','America / Toronto',-300,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Tortola','America / Tortola',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Vancouver','America / Vancouver',-480,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Whitehorse','America / Whitehorse',-420,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Winnipeg','America / Winnipeg',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Yakutat','America / Yakutat',-540,false,'00000000-0000-0000-0000-000000000000'),
  ('America/Yellowknife','America / Yellowknife',-420,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Antarctica
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Antarctica/Casey','Antarctica / Casey',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Davis','Antarctica / Davis',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/DumontDUrville','Antarctica / Dumont d''Urville',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Macquarie','Antarctica / Macquarie',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Mawson','Antarctica / Mawson',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/McMurdo','Antarctica / McMurdo',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Palmer','Antarctica / Palmer',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Rothera','Antarctica / Rothera',-180,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Syowa','Antarctica / Syowa',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Troll','Antarctica / Troll',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Antarctica/Vostok','Antarctica / Vostok',360,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Asia
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Asia/Aden','Asia / Aden',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Almaty','Asia / Almaty',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Amman','Asia / Amman',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Anadyr','Asia / Anadyr',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Aqtau','Asia / Aqtau',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Aqtobe','Asia / Aqtobe',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Ashgabat','Asia / Ashgabat',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Atyrau','Asia / Atyrau',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Baghdad','Asia / Baghdad',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Bahrain','Asia / Bahrain',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Baku','Asia / Baku',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Bangkok','Asia / Bangkok',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Barnaul','Asia / Barnaul',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Beirut','Asia / Beirut',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Bishkek','Asia / Bishkek',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Brunei','Asia / Brunei',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Chita','Asia / Chita',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Choibalsan','Asia / Choibalsan',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Colombo','Asia / Colombo',330,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Damascus','Asia / Damascus',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Dhaka','Asia / Dhaka',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Dili','Asia / Dili',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Dubai','Asia / Dubai',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Dushanbe','Asia / Dushanbe',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Famagusta','Asia / Famagusta',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Gaza','Asia / Gaza',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Hebron','Asia / Hebron',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Ho_Chi_Minh','Asia / Ho Chi Minh',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Hong_Kong','Asia / Hong Kong',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Hovd','Asia / Hovd',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Irkutsk','Asia / Irkutsk',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Jakarta','Asia / Jakarta',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Jayapura','Asia / Jayapura',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Jerusalem','Asia / Jerusalem',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kabul','Asia / Kabul',270,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kamchatka','Asia / Kamchatka',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Karachi','Asia / Karachi',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kathmandu','Asia / Kathmandu',345,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Khandyga','Asia / Khandyga',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kolkata','Asia / Kolkata',330,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Krasnoyarsk','Asia / Krasnoyarsk',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kuala_Lumpur','Asia / Kuala Lumpur',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kuching','Asia / Kuching',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Kuwait','Asia / Kuwait',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Macau','Asia / Macau',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Magadan','Asia / Magadan',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Makassar','Asia / Makassar',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Manila','Asia / Manila',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Muscat','Asia / Muscat',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Nicosia','Asia / Nicosia',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Novokuznetsk','Asia / Novokuznetsk',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Novosibirsk','Asia / Novosibirsk',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Omsk','Asia / Omsk',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Oral','Asia / Oral',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Phnom_Penh','Asia / Phnom Penh',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Pontianak','Asia / Pontianak',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Pyongyang','Asia / Pyongyang',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Qatar','Asia / Qatar',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Qostanay','Asia / Qostanay',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Qyzylorda','Asia / Qyzylorda',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Riyadh','Asia / Riyadh',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Sakhalin','Asia / Sakhalin',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Samarkand','Asia / Samarkand',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Seoul','Asia / Seoul',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Shanghai','Asia / Shanghai',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Singapore','Asia / Singapore',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Srednekolymsk','Asia / Srednekolymsk',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Taipei','Asia / Taipei',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Tashkent','Asia / Tashkent',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Tbilisi','Asia / Tbilisi',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Tehran','Asia / Tehran',210,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Thimphu','Asia / Thimphu',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Tokyo','Asia / Tokyo',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Tomsk','Asia / Tomsk',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Ulaanbaatar','Asia / Ulaanbaatar',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Urumqi','Asia / Urumqi',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Ust-Nera','Asia / Ust-Nera',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Vientiane','Asia / Vientiane',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Vladivostok','Asia / Vladivostok',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Yakutsk','Asia / Yakutsk',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Yangon','Asia / Yangon',390,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Yekaterinburg','Asia / Yekaterinburg',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Asia/Yerevan','Asia / Yerevan',240,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Atlantic
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Atlantic/Azores','Atlantic / Azores',-60,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Bermuda','Atlantic / Bermuda',-240,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Canary','Atlantic / Canary',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Cape_Verde','Atlantic / Cape Verde',-60,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Faroe','Atlantic / Faroe',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Madeira','Atlantic / Madeira',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Reykjavik','Atlantic / Reykjavik',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/South_Georgia','Atlantic / South Georgia',-120,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/St_Helena','Atlantic / St. Helena',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Atlantic/Stanley','Atlantic / Stanley',-180,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Australia
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Australia/Adelaide','Australia / Adelaide',570,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Brisbane','Australia / Brisbane',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Broken_Hill','Australia / Broken Hill',570,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Darwin','Australia / Darwin',570,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Eucla','Australia / Eucla',525,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Hobart','Australia / Hobart',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Lindeman','Australia / Lindeman',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Lord_Howe','Australia / Lord Howe',630,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Melbourne','Australia / Melbourne',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Perth','Australia / Perth',480,false,'00000000-0000-0000-0000-000000000000'),
  ('Australia/Sydney','Australia / Sydney',600,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Europe
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Europe/Amsterdam','Europe / Amsterdam',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Andorra','Europe / Andorra',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Astrakhan','Europe / Astrakhan',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Athens','Europe / Athens',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Belgrade','Europe / Belgrade',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Berlin','Europe / Berlin',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Bratislava','Europe / Bratislava',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Brussels','Europe / Brussels',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Bucharest','Europe / Bucharest',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Budapest','Europe / Budapest',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Busingen','Europe / Busingen',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Chisinau','Europe / Chisinau',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Copenhagen','Europe / Copenhagen',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Dublin','Europe / Dublin',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Gibraltar','Europe / Gibraltar',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Guernsey','Europe / Guernsey',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Helsinki','Europe / Helsinki',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Isle_of_Man','Europe / Isle of Man',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Istanbul','Europe / Istanbul',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Jersey','Europe / Jersey',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Kaliningrad','Europe / Kaliningrad',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Kirov','Europe / Kirov',180,false,'00000000-0000-0000-0000-000000000000'),
  -- IANA 2022b canonical for Ukraine; Kiev retained as alias below
  ('Europe/Kyiv','Europe / Kyiv',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Lisbon','Europe / Lisbon',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Ljubljana','Europe / Ljubljana',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/London','Europe / London',0,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Luxembourg','Europe / Luxembourg',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Madrid','Europe / Madrid',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Malta','Europe / Malta',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Mariehamn','Europe / Mariehamn',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Minsk','Europe / Minsk',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Monaco','Europe / Monaco',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Moscow','Europe / Moscow',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Oslo','Europe / Oslo',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Paris','Europe / Paris',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Podgorica','Europe / Podgorica',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Prague','Europe / Prague',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Riga','Europe / Riga',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Rome','Europe / Rome',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Samara','Europe / Samara',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/San_Marino','Europe / San Marino',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Sarajevo','Europe / Sarajevo',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Saratov','Europe / Saratov',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Simferopol','Europe / Simferopol',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Skopje','Europe / Skopje',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Sofia','Europe / Sofia',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Stockholm','Europe / Stockholm',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Tallinn','Europe / Tallinn',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Tirane','Europe / Tirane',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Ulyanovsk','Europe / Ulyanovsk',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Vaduz','Europe / Vaduz',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Vatican','Europe / Vatican',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Vienna','Europe / Vienna',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Vilnius','Europe / Vilnius',120,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Volgograd','Europe / Volgograd',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Warsaw','Europe / Warsaw',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Zagreb','Europe / Zagreb',60,false,'00000000-0000-0000-0000-000000000000'),
  ('Europe/Zurich','Europe / Zurich',60,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Indian
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Indian/Antananarivo','Indian / Antananarivo',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Chagos','Indian / Chagos',360,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Christmas','Indian / Christmas',420,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Cocos','Indian / Cocos',390,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Comoro','Indian / Comoro',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Kerguelen','Indian / Kerguelen',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Mahe','Indian / Mahe',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Maldives','Indian / Maldives',300,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Mauritius','Indian / Mauritius',240,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Mayotte','Indian / Mayotte',180,false,'00000000-0000-0000-0000-000000000000'),
  ('Indian/Reunion','Indian / Reunion',240,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Pacific
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, created_by)
values
  ('Pacific/Apia','Pacific / Apia',780,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Auckland','Pacific / Auckland',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Bougainville','Pacific / Bougainville',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Chatham','Pacific / Chatham',765,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Chuuk','Pacific / Chuuk',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Easter','Pacific / Easter',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Efate','Pacific / Efate',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Fakaofo','Pacific / Fakaofo',780,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Fiji','Pacific / Fiji',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Funafuti','Pacific / Funafuti',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Galapagos','Pacific / Galapagos',-360,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Gambier','Pacific / Gambier',-540,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Guadalcanal','Pacific / Guadalcanal',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Guam','Pacific / Guam',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Honolulu','Pacific / Honolulu',-600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Kanton','Pacific / Kanton',780,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Kiritimati','Pacific / Kiritimati',840,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Kosrae','Pacific / Kosrae',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Kwajalein','Pacific / Kwajalein',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Majuro','Pacific / Majuro',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Marquesas','Pacific / Marquesas',-570,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Midway','Pacific / Midway',-660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Nauru','Pacific / Nauru',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Niue','Pacific / Niue',-660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Norfolk','Pacific / Norfolk',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Noumea','Pacific / Noumea',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Pago_Pago','Pacific / Pago Pago',-660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Palau','Pacific / Palau',540,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Pitcairn','Pacific / Pitcairn',-480,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Pohnpei','Pacific / Pohnpei',660,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Port_Moresby','Pacific / Port Moresby',600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Rarotonga','Pacific / Rarotonga',-600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Tahiti','Pacific / Tahiti',-600,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Tarawa','Pacific / Tarawa',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Tongatapu','Pacific / Tongatapu',780,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Wake','Pacific / Wake',720,false,'00000000-0000-0000-0000-000000000000'),
  ('Pacific/Wallis','Pacific / Wallis',720,false,'00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  updated_at         = now(),
  updated_by         = excluded.created_by;

-- ============================================================================
-- Aliases (legacy / convenience names → canonical IANA code)
-- All canonical zones above must already exist before this block runs.
-- ============================================================================
insert into shared.timezone (code, name, utc_offset_minutes, is_alias, canonical_code, created_by)
values
  ('GMT',              'GMT',                    0,    true, 'Etc/GMT',                      '00000000-0000-0000-0000-000000000000'),
  ('UTC',              'UTC',                    0,    true, 'Etc/UTC',                      '00000000-0000-0000-0000-000000000000'),
  -- US convenience names
  ('US/Eastern',       'US / Eastern',         -300,   true, 'America/New_York',             '00000000-0000-0000-0000-000000000000'),
  ('US/Central',       'US / Central',         -360,   true, 'America/Chicago',              '00000000-0000-0000-0000-000000000000'),
  ('US/Mountain',      'US / Mountain',        -420,   true, 'America/Denver',               '00000000-0000-0000-0000-000000000000'),
  ('US/Pacific',       'US / Pacific',         -480,   true, 'America/Los_Angeles',          '00000000-0000-0000-0000-000000000000'),
  ('US/Alaska',        'US / Alaska',          -540,   true, 'America/Anchorage',            '00000000-0000-0000-0000-000000000000'),
  -- US/Hawaii → Pacific/Honolulu (Hawaii does not observe DST; correct canonical)
  ('US/Hawaii',        'US / Hawaii',          -600,   true, 'Pacific/Honolulu',             '00000000-0000-0000-0000-000000000000'),
  ('US/Arizona',       'US / Arizona',         -420,   true, 'America/Phoenix',              '00000000-0000-0000-0000-000000000000'),
  -- Canada convenience names
  ('Canada/Atlantic',  'Canada / Atlantic',    -240,   true, 'America/Halifax',              '00000000-0000-0000-0000-000000000000'),
  ('Canada/Central',   'Canada / Central',     -360,   true, 'America/Winnipeg',             '00000000-0000-0000-0000-000000000000'),
  ('Canada/Eastern',   'Canada / Eastern',     -300,   true, 'America/Toronto',              '00000000-0000-0000-0000-000000000000'),
  ('Canada/Mountain',  'Canada / Mountain',    -420,   true, 'America/Edmonton',             '00000000-0000-0000-0000-000000000000'),
  ('Canada/Newfoundland','Canada / Newfoundland',-210, true, 'America/St_Johns',             '00000000-0000-0000-0000-000000000000'),
  ('Canada/Pacific',   'Canada / Pacific',     -480,   true, 'America/Vancouver',            '00000000-0000-0000-0000-000000000000'),
  -- Australia state convenience names
  ('Australia/ACT',    'Australia / ACT',       600,   true, 'Australia/Sydney',             '00000000-0000-0000-0000-000000000000'),
  ('Australia/North',  'Australia / North',     570,   true, 'Australia/Darwin',             '00000000-0000-0000-0000-000000000000'),
  ('Australia/Queensland','Australia / Queensland',600, true,'Australia/Brisbane',           '00000000-0000-0000-0000-000000000000'),
  ('Australia/South',  'Australia / South',     570,   true, 'Australia/Adelaide',           '00000000-0000-0000-0000-000000000000'),
  ('Australia/West',   'Australia / West',      480,   true, 'Australia/Perth',              '00000000-0000-0000-0000-000000000000'),
  -- IANA renamed zones — old codes kept as aliases for backward compatibility
  -- IANA 2020b: America/Godthab → America/Nuuk
  ('America/Godthab',  'America / Nuuk',       -180,   true, 'America/Nuuk',                 '00000000-0000-0000-0000-000000000000'),
  -- IANA 2022b: Europe/Kiev → Europe/Kyiv
  ('Europe/Kiev',      'Europe / Kyiv',         120,   true, 'Europe/Kyiv',                  '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name               = excluded.name,
  utc_offset_minutes = excluded.utc_offset_minutes,
  is_alias           = excluded.is_alias,
  canonical_code     = excluded.canonical_code,
  updated_at         = now(),
  updated_by         = excluded.created_by;
