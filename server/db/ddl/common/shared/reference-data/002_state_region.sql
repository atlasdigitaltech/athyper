-- ISO 3166-2 subdivisions. Depends on shared.country (001_country.sql).

-- Saudi Arabia (SA) — 13 regions
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('SA-01','SA','Riyadh','region','00000000-0000-0000-0000-000000000000'),
  ('SA-02','SA','Makkah','region','00000000-0000-0000-0000-000000000000'),
  ('SA-03','SA','Al Madinah','region','00000000-0000-0000-0000-000000000000'),
  ('SA-04','SA','Eastern','region','00000000-0000-0000-0000-000000000000'),
  ('SA-05','SA','Al-Qassim','region','00000000-0000-0000-0000-000000000000'),
  ('SA-06','SA','Ha''il','region','00000000-0000-0000-0000-000000000000'),
  ('SA-07','SA','Tabuk','region','00000000-0000-0000-0000-000000000000'),
  ('SA-08','SA','Northern Borders','region','00000000-0000-0000-0000-000000000000'),
  ('SA-09','SA','Jazan','region','00000000-0000-0000-0000-000000000000'),
  ('SA-10','SA','Najran','region','00000000-0000-0000-0000-000000000000'),
  ('SA-11','SA','Al Bahah','region','00000000-0000-0000-0000-000000000000'),
  ('SA-12','SA','Al Jawf','region','00000000-0000-0000-0000-000000000000'),
  ('SA-14','SA','Asir','region','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- United Arab Emirates (AE) — 7 emirates
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('AE-AZ','AE','Abu Dhabi','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-DU','AE','Dubai','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-SH','AE','Sharjah','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-AJ','AE','Ajman','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-UQ','AE','Umm al-Quwain','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-RK','AE','Ras al-Khaimah','emirate','00000000-0000-0000-0000-000000000000'),
  ('AE-FU','AE','Fujairah','emirate','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- United States (US) — 50 states + DC
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('US-AL','US','Alabama','state','00000000-0000-0000-0000-000000000000'),
  ('US-AK','US','Alaska','state','00000000-0000-0000-0000-000000000000'),
  ('US-AZ','US','Arizona','state','00000000-0000-0000-0000-000000000000'),
  ('US-AR','US','Arkansas','state','00000000-0000-0000-0000-000000000000'),
  ('US-CA','US','California','state','00000000-0000-0000-0000-000000000000'),
  ('US-CO','US','Colorado','state','00000000-0000-0000-0000-000000000000'),
  ('US-CT','US','Connecticut','state','00000000-0000-0000-0000-000000000000'),
  ('US-DE','US','Delaware','state','00000000-0000-0000-0000-000000000000'),
  ('US-FL','US','Florida','state','00000000-0000-0000-0000-000000000000'),
  ('US-GA','US','Georgia','state','00000000-0000-0000-0000-000000000000'),
  ('US-HI','US','Hawaii','state','00000000-0000-0000-0000-000000000000'),
  ('US-ID','US','Idaho','state','00000000-0000-0000-0000-000000000000'),
  ('US-IL','US','Illinois','state','00000000-0000-0000-0000-000000000000'),
  ('US-IN','US','Indiana','state','00000000-0000-0000-0000-000000000000'),
  ('US-IA','US','Iowa','state','00000000-0000-0000-0000-000000000000'),
  ('US-KS','US','Kansas','state','00000000-0000-0000-0000-000000000000'),
  ('US-KY','US','Kentucky','state','00000000-0000-0000-0000-000000000000'),
  ('US-LA','US','Louisiana','state','00000000-0000-0000-0000-000000000000'),
  ('US-ME','US','Maine','state','00000000-0000-0000-0000-000000000000'),
  ('US-MD','US','Maryland','state','00000000-0000-0000-0000-000000000000'),
  ('US-MA','US','Massachusetts','state','00000000-0000-0000-0000-000000000000'),
  ('US-MI','US','Michigan','state','00000000-0000-0000-0000-000000000000'),
  ('US-MN','US','Minnesota','state','00000000-0000-0000-0000-000000000000'),
  ('US-MS','US','Mississippi','state','00000000-0000-0000-0000-000000000000'),
  ('US-MO','US','Missouri','state','00000000-0000-0000-0000-000000000000'),
  ('US-MT','US','Montana','state','00000000-0000-0000-0000-000000000000'),
  ('US-NE','US','Nebraska','state','00000000-0000-0000-0000-000000000000'),
  ('US-NV','US','Nevada','state','00000000-0000-0000-0000-000000000000'),
  ('US-NH','US','New Hampshire','state','00000000-0000-0000-0000-000000000000'),
  ('US-NJ','US','New Jersey','state','00000000-0000-0000-0000-000000000000'),
  ('US-NM','US','New Mexico','state','00000000-0000-0000-0000-000000000000'),
  ('US-NY','US','New York','state','00000000-0000-0000-0000-000000000000'),
  ('US-NC','US','North Carolina','state','00000000-0000-0000-0000-000000000000'),
  ('US-ND','US','North Dakota','state','00000000-0000-0000-0000-000000000000'),
  ('US-OH','US','Ohio','state','00000000-0000-0000-0000-000000000000'),
  ('US-OK','US','Oklahoma','state','00000000-0000-0000-0000-000000000000'),
  ('US-OR','US','Oregon','state','00000000-0000-0000-0000-000000000000'),
  ('US-PA','US','Pennsylvania','state','00000000-0000-0000-0000-000000000000'),
  ('US-RI','US','Rhode Island','state','00000000-0000-0000-0000-000000000000'),
  ('US-SC','US','South Carolina','state','00000000-0000-0000-0000-000000000000'),
  ('US-SD','US','South Dakota','state','00000000-0000-0000-0000-000000000000'),
  ('US-TN','US','Tennessee','state','00000000-0000-0000-0000-000000000000'),
  ('US-TX','US','Texas','state','00000000-0000-0000-0000-000000000000'),
  ('US-UT','US','Utah','state','00000000-0000-0000-0000-000000000000'),
  ('US-VT','US','Vermont','state','00000000-0000-0000-0000-000000000000'),
  ('US-VA','US','Virginia','state','00000000-0000-0000-0000-000000000000'),
  ('US-WA','US','Washington','state','00000000-0000-0000-0000-000000000000'),
  ('US-WV','US','West Virginia','state','00000000-0000-0000-0000-000000000000'),
  ('US-WI','US','Wisconsin','state','00000000-0000-0000-0000-000000000000'),
  ('US-WY','US','Wyoming','state','00000000-0000-0000-0000-000000000000'),
  ('US-DC','US','District of Columbia','district','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- United Kingdom (GB) — 4 countries
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('GB-ENG','GB','England','country','00000000-0000-0000-0000-000000000000'),
  ('GB-SCT','GB','Scotland','country','00000000-0000-0000-0000-000000000000'),
  ('GB-WLS','GB','Wales','country','00000000-0000-0000-0000-000000000000'),
  ('GB-NIR','GB','Northern Ireland','country','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- India (IN) — 28 states + 8 union territories
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('IN-AP','IN','Andhra Pradesh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-AR','IN','Arunachal Pradesh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-AS','IN','Assam','state','00000000-0000-0000-0000-000000000000'),
  ('IN-BR','IN','Bihar','state','00000000-0000-0000-0000-000000000000'),
  ('IN-CT','IN','Chhattisgarh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-GA','IN','Goa','state','00000000-0000-0000-0000-000000000000'),
  ('IN-GJ','IN','Gujarat','state','00000000-0000-0000-0000-000000000000'),
  ('IN-HR','IN','Haryana','state','00000000-0000-0000-0000-000000000000'),
  ('IN-HP','IN','Himachal Pradesh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-JH','IN','Jharkhand','state','00000000-0000-0000-0000-000000000000'),
  ('IN-KA','IN','Karnataka','state','00000000-0000-0000-0000-000000000000'),
  ('IN-KL','IN','Kerala','state','00000000-0000-0000-0000-000000000000'),
  ('IN-MP','IN','Madhya Pradesh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-MH','IN','Maharashtra','state','00000000-0000-0000-0000-000000000000'),
  ('IN-MN','IN','Manipur','state','00000000-0000-0000-0000-000000000000'),
  ('IN-ML','IN','Meghalaya','state','00000000-0000-0000-0000-000000000000'),
  ('IN-MZ','IN','Mizoram','state','00000000-0000-0000-0000-000000000000'),
  ('IN-NL','IN','Nagaland','state','00000000-0000-0000-0000-000000000000'),
  ('IN-OR','IN','Odisha','state','00000000-0000-0000-0000-000000000000'),
  ('IN-PB','IN','Punjab','state','00000000-0000-0000-0000-000000000000'),
  ('IN-RJ','IN','Rajasthan','state','00000000-0000-0000-0000-000000000000'),
  ('IN-SK','IN','Sikkim','state','00000000-0000-0000-0000-000000000000'),
  ('IN-TN','IN','Tamil Nadu','state','00000000-0000-0000-0000-000000000000'),
  ('IN-TG','IN','Telangana','state','00000000-0000-0000-0000-000000000000'),
  ('IN-TR','IN','Tripura','state','00000000-0000-0000-0000-000000000000'),
  ('IN-UP','IN','Uttar Pradesh','state','00000000-0000-0000-0000-000000000000'),
  ('IN-UT','IN','Uttarakhand','state','00000000-0000-0000-0000-000000000000'),
  ('IN-WB','IN','West Bengal','state','00000000-0000-0000-0000-000000000000'),
  -- Union Territories
  ('IN-AN','IN','Andaman and Nicobar Islands','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-CH','IN','Chandigarh','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-DH','IN','Dadra and Nagar Haveli and Daman and Diu','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-DL','IN','Delhi','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-JK','IN','Jammu and Kashmir','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-LA','IN','Ladakh','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-LD','IN','Lakshadweep','union territory','00000000-0000-0000-0000-000000000000'),
  ('IN-PY','IN','Puducherry','union territory','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- Germany (DE) — 16 states
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('DE-BW','DE','Baden-Württemberg','state','00000000-0000-0000-0000-000000000000'),
  ('DE-BY','DE','Bavaria','state','00000000-0000-0000-0000-000000000000'),
  ('DE-BE','DE','Berlin','state','00000000-0000-0000-0000-000000000000'),
  ('DE-BB','DE','Brandenburg','state','00000000-0000-0000-0000-000000000000'),
  ('DE-HB','DE','Bremen','state','00000000-0000-0000-0000-000000000000'),
  ('DE-HH','DE','Hamburg','state','00000000-0000-0000-0000-000000000000'),
  ('DE-HE','DE','Hesse','state','00000000-0000-0000-0000-000000000000'),
  ('DE-MV','DE','Mecklenburg-Vorpommern','state','00000000-0000-0000-0000-000000000000'),
  ('DE-NI','DE','Lower Saxony','state','00000000-0000-0000-0000-000000000000'),
  ('DE-NW','DE','North Rhine-Westphalia','state','00000000-0000-0000-0000-000000000000'),
  ('DE-RP','DE','Rhineland-Palatinate','state','00000000-0000-0000-0000-000000000000'),
  ('DE-SL','DE','Saarland','state','00000000-0000-0000-0000-000000000000'),
  ('DE-SN','DE','Saxony','state','00000000-0000-0000-0000-000000000000'),
  ('DE-ST','DE','Saxony-Anhalt','state','00000000-0000-0000-0000-000000000000'),
  ('DE-SH','DE','Schleswig-Holstein','state','00000000-0000-0000-0000-000000000000'),
  ('DE-TH','DE','Thuringia','state','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- France (FR) — 13 metropolitan + 5 overseas regions
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('FR-ARA','FR','Auvergne-Rhône-Alpes','region','00000000-0000-0000-0000-000000000000'),
  ('FR-BFC','FR','Bourgogne-Franche-Comté','region','00000000-0000-0000-0000-000000000000'),
  ('FR-BRE','FR','Bretagne','region','00000000-0000-0000-0000-000000000000'),
  ('FR-CVL','FR','Centre-Val de Loire','region','00000000-0000-0000-0000-000000000000'),
  ('FR-COR','FR','Corse','region','00000000-0000-0000-0000-000000000000'),
  ('FR-GES','FR','Grand Est','region','00000000-0000-0000-0000-000000000000'),
  ('FR-HDF','FR','Hauts-de-France','region','00000000-0000-0000-0000-000000000000'),
  ('FR-IDF','FR','Île-de-France','region','00000000-0000-0000-0000-000000000000'),
  ('FR-NOR','FR','Normandie','region','00000000-0000-0000-0000-000000000000'),
  ('FR-NAQ','FR','Nouvelle-Aquitaine','region','00000000-0000-0000-0000-000000000000'),
  ('FR-OCC','FR','Occitanie','region','00000000-0000-0000-0000-000000000000'),
  ('FR-PDL','FR','Pays de la Loire','region','00000000-0000-0000-0000-000000000000'),
  ('FR-PAC','FR','Provence-Alpes-Côte d''Azur','region','00000000-0000-0000-0000-000000000000'),
  ('FR-GUA','FR','Guadeloupe','region','00000000-0000-0000-0000-000000000000'),
  ('FR-GUF','FR','Guyane','region','00000000-0000-0000-0000-000000000000'),
  ('FR-MTQ','FR','Martinique','region','00000000-0000-0000-0000-000000000000'),
  ('FR-LRE','FR','La Réunion','region','00000000-0000-0000-0000-000000000000'),
  ('FR-MAY','FR','Mayotte','region','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- Egypt (EG) — 27 governorates
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('EG-ALX','EG','Alexandria','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-ASN','EG','Aswan','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-AST','EG','Asyut','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-BH','EG','Beheira','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-BNS','EG','Beni Suef','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-C','EG','Cairo','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-DK','EG','Dakahlia','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-DT','EG','Damietta','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-FYM','EG','Faiyum','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-GH','EG','Gharbia','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-GZ','EG','Giza','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-IS','EG','Ismailia','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-KFS','EG','Kafr el-Sheikh','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-LX','EG','Luxor','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-MN','EG','Minya','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-MNF','EG','Monufia','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-MT','EG','Matrouh','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-PTS','EG','Port Said','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-KB','EG','Qalyubia','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-KN','EG','Qena','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-WAD','EG','New Valley','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-SIN','EG','North Sinai','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-SHR','EG','Red Sea','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-SHG','EG','Sohag','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-JS','EG','South Sinai','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-SUZ','EG','Suez','governorate','00000000-0000-0000-0000-000000000000'),
  ('EG-HU','EG','Helwan','governorate','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- Japan (JP) — 47 prefectures
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('JP-01','JP','Hokkaido','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-02','JP','Aomori','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-03','JP','Iwate','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-04','JP','Miyagi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-05','JP','Akita','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-06','JP','Yamagata','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-07','JP','Fukushima','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-08','JP','Ibaraki','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-09','JP','Tochigi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-10','JP','Gunma','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-11','JP','Saitama','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-12','JP','Chiba','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-13','JP','Tokyo','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-14','JP','Kanagawa','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-15','JP','Niigata','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-16','JP','Toyama','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-17','JP','Ishikawa','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-18','JP','Fukui','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-19','JP','Yamanashi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-20','JP','Nagano','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-21','JP','Gifu','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-22','JP','Shizuoka','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-23','JP','Aichi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-24','JP','Mie','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-25','JP','Shiga','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-26','JP','Kyoto','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-27','JP','Osaka','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-28','JP','Hyogo','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-29','JP','Nara','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-30','JP','Wakayama','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-31','JP','Tottori','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-32','JP','Shimane','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-33','JP','Okayama','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-34','JP','Hiroshima','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-35','JP','Yamaguchi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-36','JP','Tokushima','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-37','JP','Kagawa','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-38','JP','Ehime','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-39','JP','Kochi','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-40','JP','Fukuoka','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-41','JP','Saga','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-42','JP','Nagasaki','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-43','JP','Kumamoto','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-44','JP','Oita','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-45','JP','Miyazaki','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-46','JP','Kagoshima','prefecture','00000000-0000-0000-0000-000000000000'),
  ('JP-47','JP','Okinawa','prefecture','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- Canada (CA) — 10 provinces + 3 territories
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('CA-AB','CA','Alberta','province','00000000-0000-0000-0000-000000000000'),
  ('CA-BC','CA','British Columbia','province','00000000-0000-0000-0000-000000000000'),
  ('CA-MB','CA','Manitoba','province','00000000-0000-0000-0000-000000000000'),
  ('CA-NB','CA','New Brunswick','province','00000000-0000-0000-0000-000000000000'),
  ('CA-NL','CA','Newfoundland and Labrador','province','00000000-0000-0000-0000-000000000000'),
  ('CA-NS','CA','Nova Scotia','province','00000000-0000-0000-0000-000000000000'),
  ('CA-ON','CA','Ontario','province','00000000-0000-0000-0000-000000000000'),
  ('CA-PE','CA','Prince Edward Island','province','00000000-0000-0000-0000-000000000000'),
  ('CA-QC','CA','Quebec','province','00000000-0000-0000-0000-000000000000'),
  ('CA-SK','CA','Saskatchewan','province','00000000-0000-0000-0000-000000000000'),
  ('CA-NT','CA','Northwest Territories','territory','00000000-0000-0000-0000-000000000000'),
  ('CA-NU','CA','Nunavut','territory','00000000-0000-0000-0000-000000000000'),
  ('CA-YT','CA','Yukon','territory','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- Australia (AU) — 6 states + 2 territories
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('AU-NSW','AU','New South Wales','state','00000000-0000-0000-0000-000000000000'),
  ('AU-QLD','AU','Queensland','state','00000000-0000-0000-0000-000000000000'),
  ('AU-SA','AU','South Australia','state','00000000-0000-0000-0000-000000000000'),
  ('AU-TAS','AU','Tasmania','state','00000000-0000-0000-0000-000000000000'),
  ('AU-VIC','AU','Victoria','state','00000000-0000-0000-0000-000000000000'),
  ('AU-WA','AU','Western Australia','state','00000000-0000-0000-0000-000000000000'),
  ('AU-ACT','AU','Australian Capital Territory','territory','00000000-0000-0000-0000-000000000000'),
  ('AU-NT','AU','Northern Territory','territory','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- China (CN) — 23 provinces + 4 municipalities + 5 autonomous regions + 2 SARs
insert into shared.state_region (code, country_code, name, category, created_by)
values
  -- Provinces
  ('CN-AH','CN','Anhui','province','00000000-0000-0000-0000-000000000000'),
  ('CN-FJ','CN','Fujian','province','00000000-0000-0000-0000-000000000000'),
  ('CN-GD','CN','Guangdong','province','00000000-0000-0000-0000-000000000000'),
  ('CN-GS','CN','Gansu','province','00000000-0000-0000-0000-000000000000'),
  ('CN-GZ','CN','Guizhou','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HA','CN','Henan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HB','CN','Hubei','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HE','CN','Hebei','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HI','CN','Hainan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HL','CN','Heilongjiang','province','00000000-0000-0000-0000-000000000000'),
  ('CN-HN','CN','Hunan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-JL','CN','Jilin','province','00000000-0000-0000-0000-000000000000'),
  ('CN-JS','CN','Jiangsu','province','00000000-0000-0000-0000-000000000000'),
  ('CN-JX','CN','Jiangxi','province','00000000-0000-0000-0000-000000000000'),
  ('CN-LN','CN','Liaoning','province','00000000-0000-0000-0000-000000000000'),
  ('CN-QH','CN','Qinghai','province','00000000-0000-0000-0000-000000000000'),
  ('CN-SC','CN','Sichuan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-SD','CN','Shandong','province','00000000-0000-0000-0000-000000000000'),
  ('CN-SN','CN','Shaanxi','province','00000000-0000-0000-0000-000000000000'),
  ('CN-SX','CN','Shanxi','province','00000000-0000-0000-0000-000000000000'),
  ('CN-TW','CN','Taiwan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-YN','CN','Yunnan','province','00000000-0000-0000-0000-000000000000'),
  ('CN-ZJ','CN','Zhejiang','province','00000000-0000-0000-0000-000000000000'),
  -- Municipalities
  ('CN-BJ','CN','Beijing','municipality','00000000-0000-0000-0000-000000000000'),
  ('CN-CQ','CN','Chongqing','municipality','00000000-0000-0000-0000-000000000000'),
  ('CN-SH','CN','Shanghai','municipality','00000000-0000-0000-0000-000000000000'),
  ('CN-TJ','CN','Tianjin','municipality','00000000-0000-0000-0000-000000000000'),
  -- Autonomous regions
  ('CN-GX','CN','Guangxi','autonomous region','00000000-0000-0000-0000-000000000000'),
  ('CN-NM','CN','Inner Mongolia','autonomous region','00000000-0000-0000-0000-000000000000'),
  ('CN-NX','CN','Ningxia','autonomous region','00000000-0000-0000-0000-000000000000'),
  ('CN-XJ','CN','Xinjiang','autonomous region','00000000-0000-0000-0000-000000000000'),
  ('CN-XZ','CN','Tibet','autonomous region','00000000-0000-0000-0000-000000000000'),
  -- SARs
  ('CN-HK','CN','Hong Kong','special administrative region','00000000-0000-0000-0000-000000000000'),
  ('CN-MO','CN','Macao','special administrative region','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

-- Brazil (BR) — 26 states + 1 federal district
insert into shared.state_region (code, country_code, name, category, created_by)
values
  ('BR-AC','BR','Acre','state','00000000-0000-0000-0000-000000000000'),
  ('BR-AL','BR','Alagoas','state','00000000-0000-0000-0000-000000000000'),
  ('BR-AM','BR','Amazonas','state','00000000-0000-0000-0000-000000000000'),
  ('BR-AP','BR','Amapá','state','00000000-0000-0000-0000-000000000000'),
  ('BR-BA','BR','Bahia','state','00000000-0000-0000-0000-000000000000'),
  ('BR-CE','BR','Ceará','state','00000000-0000-0000-0000-000000000000'),
  ('BR-DF','BR','Distrito Federal','federal district','00000000-0000-0000-0000-000000000000'),
  ('BR-ES','BR','Espírito Santo','state','00000000-0000-0000-0000-000000000000'),
  ('BR-GO','BR','Goiás','state','00000000-0000-0000-0000-000000000000'),
  ('BR-MA','BR','Maranhão','state','00000000-0000-0000-0000-000000000000'),
  ('BR-MG','BR','Minas Gerais','state','00000000-0000-0000-0000-000000000000'),
  ('BR-MS','BR','Mato Grosso do Sul','state','00000000-0000-0000-0000-000000000000'),
  ('BR-MT','BR','Mato Grosso','state','00000000-0000-0000-0000-000000000000'),
  ('BR-PA','BR','Pará','state','00000000-0000-0000-0000-000000000000'),
  ('BR-PB','BR','Paraíba','state','00000000-0000-0000-0000-000000000000'),
  ('BR-PE','BR','Pernambuco','state','00000000-0000-0000-0000-000000000000'),
  ('BR-PI','BR','Piauí','state','00000000-0000-0000-0000-000000000000'),
  ('BR-PR','BR','Paraná','state','00000000-0000-0000-0000-000000000000'),
  ('BR-RJ','BR','Rio de Janeiro','state','00000000-0000-0000-0000-000000000000'),
  ('BR-RN','BR','Rio Grande do Norte','state','00000000-0000-0000-0000-000000000000'),
  ('BR-RO','BR','Rondônia','state','00000000-0000-0000-0000-000000000000'),
  ('BR-RR','BR','Roraima','state','00000000-0000-0000-0000-000000000000'),
  ('BR-RS','BR','Rio Grande do Sul','state','00000000-0000-0000-0000-000000000000'),
  ('BR-SC','BR','Santa Catarina','state','00000000-0000-0000-0000-000000000000'),
  ('BR-SE','BR','Sergipe','state','00000000-0000-0000-0000-000000000000'),
  ('BR-SP','BR','São Paulo','state','00000000-0000-0000-0000-000000000000'),
  ('BR-TO','BR','Tocantins','state','00000000-0000-0000-0000-000000000000')
on conflict (code, country_code) do nothing;

