/* ============================================================================
   Industry Code Keyword Population (ISIC + NAICS)
   Schema: shared
   Table:  industry_code

   Populates the `keywords text[]` column for all industry codes by
   algorithmically extracting meaningful tokens from:
     1. The code's own name
     2. The code's description (richer detail than name alone)
     3. Its parent's name (adds hierarchical context)

   Stop words, punctuation, and short tokens (≤2 chars) are stripped.
   All keywords are lowercased, deduplicated, and sorted.

   Coverage:
     ISIC Rev.4  — 766 codes  (21 sections + 88 divisions + 238 groups + 419 classes)
     NAICS 2022  — 426 codes  (24 sectors  + 96 subsectors + 306 industry groups)
     Total       — 1,192 industry codes

   Idempotent: safe to re-run — overwrites previous keywords.
   Depends on: 009b (ISIC), 009c (NAICS) having been seeded first.
   ============================================================================ */


-- ---------------------------------------------------------------------------
-- Step 1: Helper function — extract keyword tokens from a text string
-- ---------------------------------------------------------------------------
-- Same logic as 008d_commodity_code_keywords.sql but recreated in pg_temp
-- so this file is self-contained and order-independent.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.extract_keywords(input_text text)
RETURNS text[]
LANGUAGE sql IMMUTABLE STRICT
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT token ORDER BY token),
    '{}'::text[]
  )
  FROM unnest(
    string_to_array(
      regexp_replace(
        lower(input_text),
        '[^a-z0-9 ]', ' ', 'g'
      ),
      ' '
    )
  ) AS token
  WHERE length(token) > 2
    AND token NOT IN (
      -- English stop words relevant to industry descriptions
      'and', 'the', 'for', 'are', 'but', 'not', 'you', 'all',
      'can', 'her', 'was', 'one', 'our', 'out', 'has', 'its',
      'may', 'who', 'did', 'get', 'had', 'how', 'him', 'his',
      'let', 'she', 'too', 'use', 'than', 'that', 'them',
      'then', 'they', 'this', 'from', 'have', 'been', 'into',
      'more', 'most', 'much', 'must', 'only', 'over', 'same',
      'some', 'such', 'also', 'with', 'will', 'each', 'just',
      'like', 'does', 'done', 'made', 'very', 'when', 'what',
      'which', 'while', 'where', 'their', 'there', 'these',
      'those', 'about', 'after', 'being', 'could', 'every',
      'other', 'shall', 'should', 'under', 'would', 'whether',
      'including', 'included', 'elsewhere', 'specified',
      'thereof', 'whether', 'similar', 'certain', 'articles',
      'preparations', 'products', 'containing', 'intended',
      'without', 'based', 'except', 'related', 'activities',
      'activity', 'services', 'service', 'n.e.c', 'nec'
    )
$$;


-- ---------------------------------------------------------------------------
-- Step 2: Populate keywords for ALL industry codes (ISIC + NAICS)
-- ---------------------------------------------------------------------------
-- For each code, keywords are derived from:
--   (a) Its own name
--   (b) Its own description (if present)
--   (c) Its parent's name (hierarchical context)
-- The three arrays are concatenated, then deduplicated and sorted.
-- ---------------------------------------------------------------------------

UPDATE shared.industry_code AS ic
SET
  keywords = (
    SELECT COALESCE(
      array_agg(DISTINCT kw ORDER BY kw),
      '{}'::text[]
    )
    FROM (
      -- Keywords from the code's own name
      SELECT unnest(pg_temp.extract_keywords(ic.name)) AS kw
      UNION
      -- Keywords from the code's description
      SELECT unnest(pg_temp.extract_keywords(ic.description)) AS kw
      WHERE ic.description IS NOT NULL
      UNION
      -- Keywords from the parent's name (hierarchical context)
      SELECT unnest(pg_temp.extract_keywords(p.name)) AS kw
      FROM shared.industry_code AS p
      WHERE p.domain_code = ic.domain_code
        AND p.code = ic.parent_code
    ) AS combined
  ),
  updated_at = now(),
  updated_by = '00000000-0000-0000-0000-000000000000'::uuid;


-- ---------------------------------------------------------------------------
-- Step 3: Add domain-provenance tags
-- ---------------------------------------------------------------------------
-- Helps downstream searches identify which classification system a code
-- belongs to, especially useful in cross-domain lookups.
-- ---------------------------------------------------------------------------

-- ISIC: tag all top-level sections with provenance keywords
UPDATE shared.industry_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['isic', 'international', 'united-nations', 'industry-classification'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE domain_code = 'isic'
  AND level_no = 1;

-- NAICS: tag all top-level sectors with provenance keywords
UPDATE shared.industry_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['naics', 'north-american', 'us-census', 'industry-classification'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE domain_code = 'naics'
  AND level_no = 1;


-- ---------------------------------------------------------------------------
-- Step 4: Enrich ISIC sections (A–U) with industry-domain synonyms
-- ---------------------------------------------------------------------------

-- Section A: Agriculture, Forestry and Fishing
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['agriculture', 'farming', 'livestock', 'crops', 'aquaculture', 'timber', 'primary-sector']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'A';

-- Section B: Mining and Quarrying
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['mining', 'extraction', 'petroleum', 'ore', 'quarry', 'drilling', 'primary-sector']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'B';

-- Section C: Manufacturing
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['manufacturing', 'production', 'factory', 'fabrication', 'assembly', 'industrial', 'secondary-sector']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'C';

-- Section D: Electricity, Gas, Steam
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['energy', 'utility', 'power', 'grid', 'generation', 'distribution']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'D';

-- Section E: Water Supply, Sewerage, Waste
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['water', 'sewage', 'waste', 'recycling', 'remediation', 'sanitation', 'environmental']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'E';

-- Section F: Construction
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['construction', 'building', 'civil-engineering', 'contractor', 'renovation', 'infrastructure']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'F';

-- Section G: Wholesale and Retail Trade
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['wholesale', 'retail', 'trade', 'commerce', 'merchant', 'distribution', 'sales']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'G';

-- Section H: Transportation and Storage
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['transport', 'logistics', 'freight', 'shipping', 'warehousing', 'courier', 'aviation']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'H';

-- Section I: Accommodation and Food Service
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['hospitality', 'hotel', 'restaurant', 'catering', 'tourism', 'lodging', 'food-service']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'I';

-- Section J: Information and Communication
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['technology', 'software', 'telecom', 'media', 'publishing', 'broadcasting', 'digital']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'J';

-- Section K: Financial and Insurance
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['finance', 'banking', 'insurance', 'investment', 'securities', 'pension', 'fintech']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'K';

-- Section L: Real Estate
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['real-estate', 'property', 'rental', 'leasing', 'housing', 'commercial-property']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'L';

-- Section M: Professional, Scientific and Technical
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['professional', 'consulting', 'legal', 'accounting', 'engineering', 'research', 'advisory']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'M';

-- Section N: Administrative and Support
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['administrative', 'staffing', 'recruitment', 'security', 'cleaning', 'outsourcing', 'bpo']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'N';

-- Section O: Public Administration and Defence
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['government', 'public-sector', 'defence', 'military', 'regulation', 'civil-service']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'O';

-- Section P: Education
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['education', 'school', 'university', 'training', 'teaching', 'academic', 'learning']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'P';

-- Section Q: Human Health and Social Work
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['healthcare', 'hospital', 'medical', 'nursing', 'social-work', 'clinical', 'welfare']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'Q';

-- Section R: Arts, Entertainment and Recreation
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['entertainment', 'arts', 'culture', 'sports', 'recreation', 'gambling', 'museum']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'R';

-- Section S: Other Service Activities
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['membership', 'repair', 'personal-care', 'laundry', 'association', 'nonprofit']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'S';

-- Section T: Households as Employers
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['household', 'domestic', 'employer', 'personal-staff', 'informal-sector']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'T';

-- Section U: Extraterritorial Organizations
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['international', 'diplomatic', 'embassy', 'multilateral', 'ngo', 'supranational']) ORDER BY 1)
WHERE domain_code = 'isic' AND code = 'U';


-- ---------------------------------------------------------------------------
-- Step 5: Enrich NAICS sectors with industry-domain synonyms
-- ---------------------------------------------------------------------------

-- Sector 11: Agriculture, Forestry, Fishing and Hunting
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['agriculture', 'farming', 'livestock', 'crops', 'aquaculture', 'timber', 'primary-sector']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '11';

-- Sector 21: Mining, Quarrying, Oil and Gas
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['mining', 'extraction', 'petroleum', 'natural-gas', 'ore', 'drilling', 'primary-sector']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '21';

-- Sector 22: Utilities
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['energy', 'utility', 'power', 'electricity', 'water', 'sewage', 'grid']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '22';

-- Sector 23: Construction
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['construction', 'building', 'civil-engineering', 'contractor', 'renovation', 'infrastructure']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '23';

-- Sector 31: Manufacturing (Food, Beverage, Textile, Apparel)
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['manufacturing', 'production', 'factory', 'food-processing', 'textile', 'apparel', 'secondary-sector']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '31';

-- Sector 32: Manufacturing (Wood, Paper, Petroleum, Chemical, Plastics)
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['manufacturing', 'production', 'factory', 'refinery', 'chemical', 'plastics', 'secondary-sector']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '32';

-- Sector 33: Manufacturing (Metals, Machinery, Electronics, Transport)
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['manufacturing', 'production', 'factory', 'metals', 'machinery', 'electronics', 'secondary-sector']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '33';

-- Sector 42: Wholesale Trade
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['wholesale', 'distribution', 'merchant', 'supply-chain', 'commerce', 'b2b']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '42';

-- Sector 44: Retail Trade (Motor Vehicle, Furniture, Electronics, Building)
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['retail', 'store', 'dealer', 'consumer', 'commerce', 'shopping']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '44';

-- Sector 45: Retail Trade (Food, Health, Clothing, General)
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['retail', 'store', 'consumer', 'shopping', 'grocery', 'pharmacy']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '45';

-- Sector 48: Transportation (Air, Rail, Water, Truck, Transit, Pipeline)
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['transport', 'logistics', 'freight', 'shipping', 'aviation', 'railroad', 'trucking']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '48';

-- Sector 49: Transportation (Postal, Courier, Warehousing)
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['postal', 'courier', 'warehouse', 'storage', 'logistics', 'fulfillment', 'delivery']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '49';

-- Sector 51: Information
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['technology', 'software', 'telecom', 'media', 'publishing', 'broadcasting', 'digital', 'data']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '51';

-- Sector 52: Finance and Insurance
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['finance', 'banking', 'insurance', 'investment', 'securities', 'credit', 'fintech']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '52';

-- Sector 53: Real Estate and Rental and Leasing
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['real-estate', 'property', 'rental', 'leasing', 'housing', 'landlord']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '53';

-- Sector 54: Professional, Scientific, and Technical Services
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['professional', 'consulting', 'legal', 'accounting', 'engineering', 'research', 'advisory']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '54';

-- Sector 55: Management of Companies and Enterprises
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['holding', 'corporate', 'headquarters', 'conglomerate', 'enterprise', 'portfolio']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '55';

-- Sector 56: Administrative and Support and Waste Management
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['administrative', 'staffing', 'recruitment', 'janitorial', 'security', 'waste', 'outsourcing']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '56';

-- Sector 61: Educational Services
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['education', 'school', 'university', 'training', 'teaching', 'academic', 'learning']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '61';

-- Sector 62: Health Care and Social Assistance
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['healthcare', 'hospital', 'medical', 'nursing', 'ambulatory', 'social-work', 'clinical']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '62';

-- Sector 71: Arts, Entertainment, and Recreation
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['entertainment', 'arts', 'culture', 'sports', 'recreation', 'amusement', 'performing']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '71';

-- Sector 72: Accommodation and Food Services
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['hospitality', 'hotel', 'restaurant', 'catering', 'tourism', 'lodging', 'food-service']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '72';

-- Sector 81: Other Services (except Public Administration)
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['repair', 'personal-care', 'laundry', 'religious', 'civic', 'association', 'nonprofit']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '81';

-- Sector 92: Public Administration
UPDATE shared.industry_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['government', 'public-sector', 'defense', 'executive', 'legislative', 'judicial', 'civil-service']) ORDER BY 1)
WHERE domain_code = 'naics' AND code = '92';


-- ---------------------------------------------------------------------------
-- Step 6: Cross-reference enrichment — add ISIC↔NAICS bridging keywords
-- ---------------------------------------------------------------------------
-- Since 009d_industry_crosswalk.sql maps ISIC↔NAICS, we add the partner
-- domain's common industry terms to aid cross-system search. This only
-- enriches top-level codes where the mapping is well-established.
-- ---------------------------------------------------------------------------

-- Tag ISIC manufacturing divisions (10–33) with 'manufacturing' umbrella keyword
UPDATE shared.industry_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['manufacturing', 'secondary-sector'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE domain_code = 'isic'
  AND level_no = 2
  AND parent_code = 'C';

-- Tag NAICS manufacturing subsectors with ISIC-familiar terminology
UPDATE shared.industry_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['manufacturing', 'secondary-sector', 'production'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE domain_code = 'naics'
  AND level_no = 2
  AND parent_code IN ('31', '32', '33');

-- Tag all financial-sector codes with common cross-domain search terms
UPDATE shared.industry_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['financial-services', 'finserv'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE (domain_code = 'isic' AND parent_code = 'K')
   OR (domain_code = 'naics' AND parent_code = '52');

-- Tag all healthcare codes with common cross-domain search terms
UPDATE shared.industry_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['health', 'medical', 'care'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE (domain_code = 'isic' AND parent_code = 'Q')
   OR (domain_code = 'naics' AND parent_code = '62');

-- Tag all construction codes with common cross-domain search terms
UPDATE shared.industry_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['construction', 'building', 'contractor'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE (domain_code = 'isic' AND parent_code = 'F')
   OR (domain_code = 'naics' AND parent_code = '23');

-- Tag all IT/telecom codes with common cross-domain search terms
UPDATE shared.industry_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['technology', 'digital', 'information-technology'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE (domain_code = 'isic' AND parent_code = 'J')
   OR (domain_code = 'naics' AND parent_code = '51');


-- ---------------------------------------------------------------------------
-- Done. Summary:
--   - 1,192 industry codes now have algorithmically derived keywords
--   - Keywords sourced from: name + description + parent name (3 sources)
--   - ISIC sections (A–U) enriched with 21 domain-specific synonym sets
--   - NAICS sectors enriched with 24 domain-specific synonym sets
--   - Top-level codes tagged with domain-provenance identifiers
--   - Cross-domain bridging keywords for manufacturing, finance,
--     healthcare, construction, and IT sectors
--   - All keywords: lowercased, deduplicated, sorted, >2 chars
-- ---------------------------------------------------------------------------
