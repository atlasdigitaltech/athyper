-- BCP 47 locales.
-- direction is always set explicitly so callers never derive it from language.
-- script uses ISO 15924 four-letter codes (Latn, Arab, Hebr, Deva, …).

-- Language-only locales (no country qualifier)
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  -- Major world languages (base locales)
  ('af',    'af', null, 'Latn', 'Afrikaans',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('am',    'am', null, 'Ethi', 'Amharic',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ar',    'ar', null, 'Arab', 'Arabic',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('az',    'az', null, 'Latn', 'Azerbaijani',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('be',    'be', null, 'Cyrl', 'Belarusian',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bg',    'bg', null, 'Cyrl', 'Bulgarian',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bn',    'bn', null, 'Beng', 'Bengali',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bs',    'bs', null, 'Latn', 'Bosnian',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ca',    'ca', null, 'Latn', 'Catalan',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('cs',    'cs', null, 'Latn', 'Czech',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('cy',    'cy', null, 'Latn', 'Welsh',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('da',    'da', null, 'Latn', 'Danish',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('de',    'de', null, 'Latn', 'German',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('el',    'el', null, 'Grek', 'Greek',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en',    'en', null, 'Latn', 'English',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es',    'es', null, 'Latn', 'Spanish',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('et',    'et', null, 'Latn', 'Estonian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('eu',    'eu', null, 'Latn', 'Basque',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fa',    'fa', null, 'Arab', 'Persian',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('fi',    'fi', null, 'Latn', 'Finnish',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr',    'fr', null, 'Latn', 'French',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ga',    'ga', null, 'Latn', 'Irish',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('gl',    'gl', null, 'Latn', 'Galician',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('gu',    'gu', null, 'Gujr', 'Gujarati',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('he',    'he', null, 'Hebr', 'Hebrew',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('hi',    'hi', null, 'Deva', 'Hindi',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hr',    'hr', null, 'Latn', 'Croatian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hu',    'hu', null, 'Latn', 'Hungarian',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hy',    'hy', null, 'Armn', 'Armenian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('id',    'id', null, 'Latn', 'Indonesian',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('is',    'is', null, 'Latn', 'Icelandic',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('it',    'it', null, 'Latn', 'Italian',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ja',    'ja', null, 'Jpan', 'Japanese',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ka',    'ka', null, 'Geor', 'Georgian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('kk',    'kk', null, 'Cyrl', 'Kazakh',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('km',    'km', null, 'Khmr', 'Khmer',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('kn',    'kn', null, 'Knda', 'Kannada',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ko',    'ko', null, 'Kore', 'Korean',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  -- Kurdish base locale uses Latin script (Kurmanji default); Sorani/Arabic-script
  -- variants are added as country-qualified locales below (ku-IQ, ku-IR)
  ('ku',    'ku', null, 'Latn', 'Kurdish',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lo',    'lo', null, 'Laoo', 'Lao',                     'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lt',    'lt', null, 'Latn', 'Lithuanian',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lv',    'lv', null, 'Latn', 'Latvian',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mk',    'mk', null, 'Cyrl', 'Macedonian',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ml',    'ml', null, 'Mlym', 'Malayalam',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mn',    'mn', null, 'Cyrl', 'Mongolian',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mr',    'mr', null, 'Deva', 'Marathi',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ms',    'ms', null, 'Latn', 'Malay',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mt',    'mt', null, 'Latn', 'Maltese',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('my',    'my', null, 'Mymr', 'Burmese',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nb',    'nb', null, 'Latn', 'Norwegian Bokmål',       'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ne',    'ne', null, 'Deva', 'Nepali',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nl',    'nl', null, 'Latn', 'Dutch',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nn',    'nn', null, 'Latn', 'Norwegian Nynorsk',       'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pa',    'pa', null, 'Guru', 'Punjabi',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pl',    'pl', null, 'Latn', 'Polish',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ps',    'ps', null, 'Arab', 'Pashto',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('pt',    'pt', null, 'Latn', 'Portuguese',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ro',    'ro', null, 'Latn', 'Romanian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ru',    'ru', null, 'Cyrl', 'Russian',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  -- Sindhi base locale: Arabic script used in Pakistan (primary population).
  -- Devanagari-script variant (India) added as sd-IN below.
  ('sd',    'sd', null, 'Arab', 'Sindhi',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('si',    'si', null, 'Sinh', 'Sinhala',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sk',    'sk', null, 'Latn', 'Slovak',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sl',    'sl', null, 'Latn', 'Slovenian',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('so',    'so', null, 'Latn', 'Somali',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sq',    'sq', null, 'Latn', 'Albanian',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sr',    'sr', null, 'Cyrl', 'Serbian',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sv',    'sv', null, 'Latn', 'Swedish',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sw',    'sw', null, 'Latn', 'Swahili',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ta',    'ta', null, 'Taml', 'Tamil',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('te',    'te', null, 'Telu', 'Telugu',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('th',    'th', null, 'Thai', 'Thai',                    'ltr', '00000000-0000-0000-0000-000000000000'),
  ('tl',    'tl', null, 'Latn', 'Filipino',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('tr',    'tr', null, 'Latn', 'Turkish',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  -- Uyghur: Arabic Perso-Arabic script (dominant in Xinjiang); Latin and Cyrillic
  -- variants are not widely used but added below as ug-Latn if needed.
  ('ug',    'ug', null, 'Arab', 'Uyghur',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('uk',    'uk', null, 'Cyrl', 'Ukrainian',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ur',    'ur', null, 'Arab', 'Urdu',                    'rtl', '00000000-0000-0000-0000-000000000000'),
  ('uz',    'uz', null, 'Latn', 'Uzbek',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('vi',    'vi', null, 'Latn', 'Vietnamese',              'ltr', '00000000-0000-0000-0000-000000000000'),
  -- Yiddish: Hebrew script, right-to-left. Primarily Ashkenazi Jewish communities.
  ('yi',    'yi', null, 'Hebr', 'Yiddish',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('zh',    'zh', null, 'Hans', 'Chinese',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('zu',    'zu', null, 'Latn', 'Zulu',                    'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- Country-qualified locales (language-COUNTRY)

-- Arabic variants (all RTL, Arab script)
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('ar-SA', 'ar', 'SA', 'Arab', 'Arabic (Saudi Arabia)',            'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-AE', 'ar', 'AE', 'Arab', 'Arabic (United Arab Emirates)',    'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-BH', 'ar', 'BH', 'Arab', 'Arabic (Bahrain)',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-DZ', 'ar', 'DZ', 'Arab', 'Arabic (Algeria)',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-EG', 'ar', 'EG', 'Arab', 'Arabic (Egypt)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-IQ', 'ar', 'IQ', 'Arab', 'Arabic (Iraq)',                    'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-JO', 'ar', 'JO', 'Arab', 'Arabic (Jordan)',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-KW', 'ar', 'KW', 'Arab', 'Arabic (Kuwait)',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-LB', 'ar', 'LB', 'Arab', 'Arabic (Lebanon)',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-LY', 'ar', 'LY', 'Arab', 'Arabic (Libya)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-MA', 'ar', 'MA', 'Arab', 'Arabic (Morocco)',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-OM', 'ar', 'OM', 'Arab', 'Arabic (Oman)',                    'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-QA', 'ar', 'QA', 'Arab', 'Arabic (Qatar)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-SD', 'ar', 'SD', 'Arab', 'Arabic (Sudan)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-SY', 'ar', 'SY', 'Arab', 'Arabic (Syria)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-TN', 'ar', 'TN', 'Arab', 'Arabic (Tunisia)',                 'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ar-YE', 'ar', 'YE', 'Arab', 'Arabic (Yemen)',                   'rtl', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- English variants
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('en-US', 'en', 'US', 'Latn', 'English (United States)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-GB', 'en', 'GB', 'Latn', 'English (United Kingdom)',         'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-AU', 'en', 'AU', 'Latn', 'English (Australia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-CA', 'en', 'CA', 'Latn', 'English (Canada)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-IE', 'en', 'IE', 'Latn', 'English (Ireland)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-IN', 'en', 'IN', 'Latn', 'English (India)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-NZ', 'en', 'NZ', 'Latn', 'English (New Zealand)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-PH', 'en', 'PH', 'Latn', 'English (Philippines)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-SG', 'en', 'SG', 'Latn', 'English (Singapore)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-ZA', 'en', 'ZA', 'Latn', 'English (South Africa)',           'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-HK', 'en', 'HK', 'Latn', 'English (Hong Kong)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-KE', 'en', 'KE', 'Latn', 'English (Kenya)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('en-NG', 'en', 'NG', 'Latn', 'English (Nigeria)',                'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- Spanish variants
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('es-ES', 'es', 'ES', 'Latn', 'Spanish (Spain)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-MX', 'es', 'MX', 'Latn', 'Spanish (Mexico)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-AR', 'es', 'AR', 'Latn', 'Spanish (Argentina)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-CL', 'es', 'CL', 'Latn', 'Spanish (Chile)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-CO', 'es', 'CO', 'Latn', 'Spanish (Colombia)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-PE', 'es', 'PE', 'Latn', 'Spanish (Peru)',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-VE', 'es', 'VE', 'Latn', 'Spanish (Venezuela)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-EC', 'es', 'EC', 'Latn', 'Spanish (Ecuador)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-UY', 'es', 'UY', 'Latn', 'Spanish (Uruguay)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('es-CR', 'es', 'CR', 'Latn', 'Spanish (Costa Rica)',             'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- French variants
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('fr-FR', 'fr', 'FR', 'Latn', 'French (France)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-BE', 'fr', 'BE', 'Latn', 'French (Belgium)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-CA', 'fr', 'CA', 'Latn', 'French (Canada)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-CH', 'fr', 'CH', 'Latn', 'French (Switzerland)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-LU', 'fr', 'LU', 'Latn', 'French (Luxembourg)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-SN', 'fr', 'SN', 'Latn', 'French (Senegal)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-CI', 'fr', 'CI', 'Latn', 'French (Côte d''Ivoire)',         'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-CM', 'fr', 'CM', 'Latn', 'French (Cameroon)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-MA', 'fr', 'MA', 'Latn', 'French (Morocco)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fr-TN', 'fr', 'TN', 'Latn', 'French (Tunisia)',                 'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- German variants
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('de-DE', 'de', 'DE', 'Latn', 'German (Germany)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('de-AT', 'de', 'AT', 'Latn', 'German (Austria)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('de-CH', 'de', 'CH', 'Latn', 'German (Switzerland)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('de-LU', 'de', 'LU', 'Latn', 'German (Luxembourg)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('de-LI', 'de', 'LI', 'Latn', 'German (Liechtenstein)',           'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- Portuguese variants
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('pt-BR', 'pt', 'BR', 'Latn', 'Portuguese (Brazil)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pt-PT', 'pt', 'PT', 'Latn', 'Portuguese (Portugal)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pt-AO', 'pt', 'AO', 'Latn', 'Portuguese (Angola)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pt-MZ', 'pt', 'MZ', 'Latn', 'Portuguese (Mozambique)',          'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- Chinese variants (simplified vs. traditional distinguished by script)
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  ('zh-CN', 'zh', 'CN', 'Hans', 'Chinese (Simplified, China)',      'ltr', '00000000-0000-0000-0000-000000000000'),
  ('zh-TW', 'zh', 'TW', 'Hant', 'Chinese (Traditional, Taiwan)',    'ltr', '00000000-0000-0000-0000-000000000000'),
  ('zh-HK', 'zh', 'HK', 'Hant', 'Chinese (Traditional, Hong Kong)', 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('zh-SG', 'zh', 'SG', 'Hans', 'Chinese (Simplified, Singapore)',  'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;

-- Other major country-qualified locales
insert into shared.locale (code, language_code, country_code, script, name, direction, created_by)
values
  -- South Asia
  ('hi-IN', 'hi', 'IN', 'Deva', 'Hindi (India)',                    'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bn-BD', 'bn', 'BD', 'Beng', 'Bengali (Bangladesh)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bn-IN', 'bn', 'IN', 'Beng', 'Bengali (India)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ta-IN', 'ta', 'IN', 'Taml', 'Tamil (India)',                    'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ta-LK', 'ta', 'LK', 'Taml', 'Tamil (Sri Lanka)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('te-IN', 'te', 'IN', 'Telu', 'Telugu (India)',                   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ml-IN', 'ml', 'IN', 'Mlym', 'Malayalam (India)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('kn-IN', 'kn', 'IN', 'Knda', 'Kannada (India)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('gu-IN', 'gu', 'IN', 'Gujr', 'Gujarati (India)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mr-IN', 'mr', 'IN', 'Deva', 'Marathi (India)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pa-IN', 'pa', 'IN', 'Guru', 'Punjabi (India)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ur-PK', 'ur', 'PK', 'Arab', 'Urdu (Pakistan)',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ur-IN', 'ur', 'IN', 'Arab', 'Urdu (India)',                     'rtl', '00000000-0000-0000-0000-000000000000'),
  ('si-LK', 'si', 'LK', 'Sinh', 'Sinhala (Sri Lanka)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ne-NP', 'ne', 'NP', 'Deva', 'Nepali (Nepal)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sd-PK', 'sd', 'PK', 'Arab', 'Sindhi (Pakistan)',               'rtl', '00000000-0000-0000-0000-000000000000'),
  ('sd-IN', 'sd', 'IN', 'Deva', 'Sindhi (India)',                  'ltr', '00000000-0000-0000-0000-000000000000'),

  -- East/Southeast Asia
  ('ja-JP', 'ja', 'JP', 'Jpan', 'Japanese (Japan)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ko-KR', 'ko', 'KR', 'Kore', 'Korean (South Korea)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('th-TH', 'th', 'TH', 'Thai', 'Thai (Thailand)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('vi-VN', 'vi', 'VN', 'Latn', 'Vietnamese (Vietnam)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('id-ID', 'id', 'ID', 'Latn', 'Indonesian (Indonesia)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ms-MY', 'ms', 'MY', 'Latn', 'Malay (Malaysia)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ms-SG', 'ms', 'SG', 'Latn', 'Malay (Singapore)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('tl-PH', 'tl', 'PH', 'Latn', 'Filipino (Philippines)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('my-MM', 'my', 'MM', 'Mymr', 'Burmese (Myanmar)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('km-KH', 'km', 'KH', 'Khmr', 'Khmer (Cambodia)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lo-LA', 'lo', 'LA', 'Laoo', 'Lao (Laos)',                     'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mn-MN', 'mn', 'MN', 'Cyrl', 'Mongolian (Mongolia)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  -- Uyghur in China uses Arabic Perso-Arabic script → RTL
  ('ug-CN', 'ug', 'CN', 'Arab', 'Uyghur (China)',                  'rtl', '00000000-0000-0000-0000-000000000000'),

  -- Europe (one main locale per language)
  ('nl-NL', 'nl', 'NL', 'Latn', 'Dutch (Netherlands)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nl-BE', 'nl', 'BE', 'Latn', 'Dutch (Belgium)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('it-IT', 'it', 'IT', 'Latn', 'Italian (Italy)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('it-CH', 'it', 'CH', 'Latn', 'Italian (Switzerland)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('pl-PL', 'pl', 'PL', 'Latn', 'Polish (Poland)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('cs-CZ', 'cs', 'CZ', 'Latn', 'Czech (Czech Republic)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sk-SK', 'sk', 'SK', 'Latn', 'Slovak (Slovakia)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hu-HU', 'hu', 'HU', 'Latn', 'Hungarian (Hungary)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ro-RO', 'ro', 'RO', 'Latn', 'Romanian (Romania)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bg-BG', 'bg', 'BG', 'Cyrl', 'Bulgarian (Bulgaria)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hr-HR', 'hr', 'HR', 'Latn', 'Croatian (Croatia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sr-RS', 'sr', 'RS', 'Cyrl', 'Serbian (Serbia)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sl-SI', 'sl', 'SI', 'Latn', 'Slovenian (Slovenia)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('bs-BA', 'bs', 'BA', 'Latn', 'Bosnian (Bosnia and Herzegovina)', 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sq-AL', 'sq', 'AL', 'Latn', 'Albanian (Albania)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mk-MK', 'mk', 'MK', 'Cyrl', 'Macedonian (North Macedonia)',   'ltr', '00000000-0000-0000-0000-000000000000'),
  ('el-GR', 'el', 'GR', 'Grek', 'Greek (Greece)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('el-CY', 'el', 'CY', 'Grek', 'Greek (Cyprus)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('da-DK', 'da', 'DK', 'Latn', 'Danish (Denmark)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sv-SE', 'sv', 'SE', 'Latn', 'Swedish (Sweden)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sv-FI', 'sv', 'FI', 'Latn', 'Swedish (Finland)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nb-NO', 'nb', 'NO', 'Latn', 'Norwegian Bokmål (Norway)',      'ltr', '00000000-0000-0000-0000-000000000000'),
  ('nn-NO', 'nn', 'NO', 'Latn', 'Norwegian Nynorsk (Norway)',      'ltr', '00000000-0000-0000-0000-000000000000'),
  ('fi-FI', 'fi', 'FI', 'Latn', 'Finnish (Finland)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('et-EE', 'et', 'EE', 'Latn', 'Estonian (Estonia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lt-LT', 'lt', 'LT', 'Latn', 'Lithuanian (Lithuania)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('lv-LV', 'lv', 'LV', 'Latn', 'Latvian (Latvia)',               'ltr', '00000000-0000-0000-0000-000000000000'),
  ('is-IS', 'is', 'IS', 'Latn', 'Icelandic (Iceland)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('mt-MT', 'mt', 'MT', 'Latn', 'Maltese (Malta)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ga-IE', 'ga', 'IE', 'Latn', 'Irish (Ireland)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('cy-GB', 'cy', 'GB', 'Latn', 'Welsh (United Kingdom)',          'ltr', '00000000-0000-0000-0000-000000000000'),
  ('eu-ES', 'eu', 'ES', 'Latn', 'Basque (Spain)',                  'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ca-ES', 'ca', 'ES', 'Latn', 'Catalan (Spain)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('gl-ES', 'gl', 'ES', 'Latn', 'Galician (Spain)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ru-RU', 'ru', 'RU', 'Cyrl', 'Russian (Russia)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('uk-UA', 'uk', 'UA', 'Cyrl', 'Ukrainian (Ukraine)',             'ltr', '00000000-0000-0000-0000-000000000000'),
  ('be-BY', 'be', 'BY', 'Cyrl', 'Belarusian (Belarus)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('hy-AM', 'hy', 'AM', 'Armn', 'Armenian (Armenia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('ka-GE', 'ka', 'GE', 'Geor', 'Georgian (Georgia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('tr-TR', 'tr', 'TR', 'Latn', 'Turkish (Turkey)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('az-AZ', 'az', 'AZ', 'Latn', 'Azerbaijani (Azerbaijan)',        'ltr', '00000000-0000-0000-0000-000000000000'),
  ('kk-KZ', 'kk', 'KZ', 'Cyrl', 'Kazakh (Kazakhstan)',            'ltr', '00000000-0000-0000-0000-000000000000'),
  ('uz-UZ', 'uz', 'UZ', 'Latn', 'Uzbek (Uzbekistan)',              'ltr', '00000000-0000-0000-0000-000000000000'),

  -- Middle East / Central Asia
  ('fa-IR', 'fa', 'IR', 'Arab', 'Persian (Iran)',                   'rtl', '00000000-0000-0000-0000-000000000000'),
  ('fa-AF', 'fa', 'AF', 'Arab', 'Dari (Afghanistan)',               'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ps-AF', 'ps', 'AF', 'Arab', 'Pashto (Afghanistan)',             'rtl', '00000000-0000-0000-0000-000000000000'),
  ('he-IL', 'he', 'IL', 'Hebr', 'Hebrew (Israel)',                  'rtl', '00000000-0000-0000-0000-000000000000'),
  -- Kurdish: Sorani dialect uses Arabic script (RTL) in Iraq and Iran
  ('ku-IQ', 'ku', 'IQ', 'Arab', 'Kurdish Sorani (Iraq)',            'rtl', '00000000-0000-0000-0000-000000000000'),
  ('ku-IR', 'ku', 'IR', 'Arab', 'Kurdish Sorani (Iran)',            'rtl', '00000000-0000-0000-0000-000000000000'),
  -- Kurdish: Kurmanji dialect uses Latin script (LTR) in Turkey
  ('ku-TR', 'ku', 'TR', 'Latn', 'Kurdish Kurmanji (Turkey)',        'ltr', '00000000-0000-0000-0000-000000000000'),

  -- Africa
  ('sw-KE', 'sw', 'KE', 'Latn', 'Swahili (Kenya)',                 'ltr', '00000000-0000-0000-0000-000000000000'),
  ('sw-TZ', 'sw', 'TZ', 'Latn', 'Swahili (Tanzania)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('am-ET', 'am', 'ET', 'Ethi', 'Amharic (Ethiopia)',              'ltr', '00000000-0000-0000-0000-000000000000'),
  ('so-SO', 'so', 'SO', 'Latn', 'Somali (Somalia)',                'ltr', '00000000-0000-0000-0000-000000000000'),
  ('af-ZA', 'af', 'ZA', 'Latn', 'Afrikaans (South Africa)',        'ltr', '00000000-0000-0000-0000-000000000000'),
  ('zu-ZA', 'zu', 'ZA', 'Latn', 'Zulu (South Africa)',             'ltr', '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
  name          = excluded.name,
  language_code = excluded.language_code,
  country_code  = excluded.country_code,
  script        = excluded.script,
  direction     = excluded.direction,
  updated_at    = now(),
  updated_by    = excluded.created_by;
