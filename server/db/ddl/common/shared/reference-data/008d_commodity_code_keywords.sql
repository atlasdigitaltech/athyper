-- Populates commodity_code.keywords[] from the code's own name + its parent's name
-- (hierarchical context). Depends on 008a (UNSPSC) and 008b (HS) being loaded first.

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
        '[^a-z0-9 ]', ' ', 'g'    -- replace all non-alphanumeric with space
      ),
      ' '
    )
  ) AS token
  WHERE length(token) > 2
    AND token NOT IN (
      -- English stop words relevant to commodity descriptions
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
      'without', 'based'
    )
$$;


UPDATE shared.commodity_code AS cc
SET
  keywords = (
    SELECT COALESCE(
      array_agg(DISTINCT kw ORDER BY kw),
      '{}'::text[]
    )
    FROM (
      -- Keywords from the code's own name
      SELECT unnest(pg_temp.extract_keywords(cc.name)) AS kw
      UNION
      -- Keywords from the parent's name (hierarchical context)
      SELECT unnest(pg_temp.extract_keywords(p.name)) AS kw
      FROM shared.commodity_code AS p
      WHERE p.domain_code = cc.domain_code
        AND p.code = cc.parent_code
    ) AS combined
  ),
  updated_at = now(),
  updated_by = '00000000-0000-0000-0000-000000000000'::uuid;


-- Segment-level domain tags so free-text "services"/"goods" filters land on UNSPSC L1.
-- UNSPSC convention: segments < 64000000 are goods, >= 64000000 are services/intangibles.

-- Goods segments (10-60)
UPDATE shared.commodity_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['goods', 'tangible', 'physical'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE domain_code = 'unspsc'
  AND level_no = 1
  AND code < '64000000';

-- Service/intangible segments (64-95)
UPDATE shared.commodity_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['services', 'intangible'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE domain_code = 'unspsc'
  AND level_no = 1
  AND code >= '64000000';

-- HS chapters
UPDATE shared.commodity_code
SET
  keywords = array(
    SELECT DISTINCT unnest(keywords || ARRAY['goods', 'trade', 'customs', 'harmonized'])
    ORDER BY 1
  ),
  updated_at = now()
WHERE domain_code = 'hs'
  AND level_no = 1;


-- HS chapters → 21 sections — adds section-level synonyms (metals, textiles, …) for FTS.

-- Section I: Live animals, animal products (Ch 01-05)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['animal', 'livestock', 'biological']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('01','02','03','04','05');

-- Section II: Vegetable products (Ch 06–14)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['vegetable', 'plant', 'botanical', 'agricultural']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('06','07','08','09','10','11','12','13','14');

-- Section III: Fats and oils (Ch 15)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['fats', 'oils', 'waxes']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code = '15';

-- Section IV: Foodstuffs, beverages, tobacco (Ch 16–24)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['food', 'beverage', 'consumable']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('16','17','18','19','20','21','22','23','24');

-- Section V: Mineral products (Ch 25–27)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['mineral', 'mining', 'extraction', 'raw']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('25','26','27');

-- Section VI: Chemical products (Ch 28–38)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['chemical', 'compound', 'substance']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('28','29','30','31','32','33','34','35','36','37','38');

-- Section VII: Plastics and rubber (Ch 39–40)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['polymer', 'synthetic', 'material']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('39','40');

-- Section VIII: Hides, skins, leather (Ch 41–43)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['leather', 'hide', 'skin', 'fur']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('41','42','43');

-- Section IX: Wood, cork, straw (Ch 44–46)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['wood', 'timber', 'forestry']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('44','45','46');

-- Section X: Pulp, paper (Ch 47–49)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['paper', 'pulp', 'printing', 'publishing']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('47','48','49');

-- Section XI: Textiles (Ch 50–63)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['textile', 'fabric', 'fiber', 'garment', 'clothing']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('50','51','52','53','54','55','56','57','58','59','60','61','62','63');

-- Section XII: Footwear, headgear (Ch 64–67)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['footwear', 'headgear', 'apparel', 'accessory']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('64','65','66','67');

-- Section XIII: Stone, ceramic, glass (Ch 68–70)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['stone', 'ceramic', 'glass', 'construction']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('68','69','70');

-- Section XIV: Precious metals and stones (Ch 71)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['precious', 'jewelry', 'gemstone', 'gold', 'silver']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code = '71';

-- Section XV: Base metals (Ch 72–83)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['metal', 'steel', 'iron', 'alloy', 'industrial']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('72','73','74','75','76','77','78','79','80','81','82','83');

-- Section XVI: Machinery and electrical (Ch 84–85)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['machinery', 'equipment', 'electrical', 'electronic', 'mechanical']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('84','85');

-- Section XVII: Vehicles and transport (Ch 86–89)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['vehicle', 'transport', 'aircraft', 'vessel', 'shipping']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('86','87','88','89');

-- Section XVIII: Instruments, clocks (Ch 90–92)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['instrument', 'precision', 'optical', 'measuring']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('90','91','92');

-- Section XIX: Arms and ammunition (Ch 93)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['arms', 'ammunition', 'weapon', 'defense']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code = '93';

-- Section XX: Miscellaneous manufactured (Ch 94–96)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['manufactured', 'furniture', 'miscellaneous']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code IN ('94','95','96');

-- Section XXI: Works of art (Ch 97)
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['art', 'antique', 'collectible', 'cultural']) ORDER BY 1)
WHERE domain_code = 'hs' AND level_no = 1 AND code = '97';


-- UNSPSC segment-level industry synonyms.

-- Segment 10: Live animals & plants
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['agriculture', 'livestock', 'horticulture', 'botanical', 'farming']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '10000000';

-- Segment 11: Minerals & textiles
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['mining', 'textile', 'fiber', 'raw', 'material']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '11000000';

-- Segment 12: Chemicals
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['chemical', 'reagent', 'laboratory', 'industrial', 'compound']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '12000000';

-- Segment 13: Resins & polymers
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['polymer', 'synthetic', 'adhesive', 'sealant', 'coating']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '13000000';

-- Segment 14: Paper
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['paper', 'cardboard', 'packaging', 'pulp', 'stationery']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '14000000';

-- Segment 15: Fuels & lubricants
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['petroleum', 'oil', 'gas', 'energy', 'diesel', 'gasoline']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '15000000';

-- Segment 20: Mining machinery
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['drilling', 'excavation', 'heavy', 'equipment', 'mining']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '20000000';

-- Segment 21: Farming machinery
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['tractor', 'harvester', 'agricultural', 'equipment', 'irrigation']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '21000000';

-- Segment 22: Construction machinery
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['construction', 'excavator', 'crane', 'heavy', 'earthmoving']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '22000000';

-- Segment 23: Industrial manufacturing machinery
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['manufacturing', 'fabrication', 'assembly', 'production', 'automation']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '23000000';

-- Segment 24: Material handling
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['forklift', 'conveyor', 'warehouse', 'logistics', 'storage']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '24000000';

-- Segment 25: Vehicles
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['automotive', 'fleet', 'truck', 'car', 'transport']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '25000000';

-- Segment 26: Power generation
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['energy', 'electrical', 'generator', 'transformer', 'utility']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '26000000';

-- Segment 27: Tools
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['hand', 'power', 'cutting', 'measuring', 'workshop']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '27000000';

-- Segment 30: Building components
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['construction', 'structural', 'building', 'lumber', 'concrete', 'hardware']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '30000000';

-- Segment 31: Manufacturing components
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['fastener', 'bearing', 'gasket', 'seal', 'component']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '31000000';

-- Segment 32: Electronic components
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['semiconductor', 'capacitor', 'resistor', 'circuit', 'pcb']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '32000000';

-- Segment 39: Electrical systems
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['wiring', 'lighting', 'switch', 'panel', 'cable', 'conduit']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '39000000';

-- Segment 40: HVAC & distribution
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['hvac', 'plumbing', 'piping', 'valve', 'pump', 'filtration']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '40000000';

-- Segment 41: Lab & testing equipment
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['laboratory', 'scientific', 'analytical', 'calibration', 'research']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '41000000';

-- Segment 42: Medical equipment
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['medical', 'healthcare', 'surgical', 'diagnostic', 'clinical', 'hospital']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '42000000';

-- Segment 43: IT & telecommunications
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['computer', 'software', 'network', 'server', 'telecom', 'digital']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '43000000';

-- Segment 44: Office supplies
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['office', 'desk', 'printer', 'stationery', 'filing', 'workspace']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '44000000';

-- Segment 45: Printing & AV equipment
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['camera', 'projector', 'audio', 'video', 'media', 'display']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '45000000';

-- Segment 46: Defense & safety equipment
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['security', 'safety', 'protective', 'ppe', 'surveillance', 'firearm']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '46000000';

-- Segment 47: Cleaning supplies
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['janitorial', 'sanitation', 'detergent', 'hygiene', 'maintenance']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '47000000';

-- Segment 48: Service industry machinery
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['commercial', 'hospitality', 'foodservice', 'laundry', 'vending']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '48000000';

-- Segment 49: Sports & recreation
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['sports', 'fitness', 'outdoor', 'recreation', 'leisure', 'athletic']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '49000000';

-- Segment 50: Food & beverage
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['food', 'beverage', 'grocery', 'perishable', 'consumable', 'catering']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '50000000';

-- Segment 51: Pharmaceuticals
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['drug', 'medicine', 'pharmaceutical', 'vaccine', 'therapeutic', 'prescription']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '51000000';

-- Segment 52: Consumer electronics & appliances
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['appliance', 'consumer', 'household', 'kitchen', 'laundry']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '52000000';

-- Segment 53: Apparel & personal care
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['clothing', 'garment', 'fashion', 'cosmetic', 'toiletry', 'accessory']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '53000000';

-- Segment 54: Timepieces & jewelry
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['watch', 'clock', 'jewelry', 'gemstone', 'precious', 'luxury']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '54000000';

-- Segment 55: Published products
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['book', 'publication', 'periodical', 'media', 'literature', 'reference']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '55000000';

-- Segment 56: Furniture
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['furniture', 'seating', 'shelving', 'cabinet', 'interior', 'decor']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '56000000';

-- Segment 60: Musical instruments, games, arts, education
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['music', 'toy', 'game', 'art', 'craft', 'education', 'school']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '60000000';

-- Segment 64: Financial instruments
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['banking', 'securities', 'insurance', 'contract', 'derivatives', 'bond']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '64000000';

-- Segment 70: Farming/fishing/forestry services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['agriculture', 'aquaculture', 'forestry', 'wildlife', 'contracting']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '70000000';

-- Segment 71: Mining & oil/gas services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['drilling', 'exploration', 'extraction', 'petroleum', 'oilfield']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '71000000';

-- Segment 72: Construction & maintenance services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['construction', 'renovation', 'plumbing', 'electrical', 'hvac', 'facility']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '72000000';

-- Segment 73: Industrial production services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['manufacturing', 'machining', 'fabrication', 'assembly', 'processing']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '73000000';

-- Segment 76: Industrial cleaning services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['janitorial', 'sanitation', 'decontamination', 'facility', 'maintenance']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '76000000';

-- Segment 77: Environmental services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['environmental', 'remediation', 'waste', 'pollution', 'compliance', 'sustainability']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '77000000';

-- Segment 78: Transportation & logistics services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['freight', 'shipping', 'logistics', 'warehouse', 'courier', 'postal']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '78000000';

-- Segment 80: Management & business services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['consulting', 'staffing', 'outsourcing', 'advisory', 'recruitment', 'hr']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '80000000';

-- Segment 81: Engineering & technology services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['engineering', 'software', 'consulting', 'development', 'testing', 'research']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '81000000';

-- Segment 82: Editorial & design services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['design', 'graphic', 'editorial', 'creative', 'copywriting', 'branding']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '82000000';

-- Segment 83: Public utilities & public sector
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['utility', 'electricity', 'water', 'gas', 'government', 'municipal']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '83000000';

-- Segment 84: Financial & insurance services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['banking', 'insurance', 'accounting', 'audit', 'tax', 'investment']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '84000000';

-- Segment 85: Healthcare services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['medical', 'clinical', 'hospital', 'dental', 'nursing', 'therapy']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '85000000';

-- Segment 86: Education & training services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['education', 'training', 'school', 'university', 'certification', 'learning']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '86000000';

-- Segment 90: Travel & hospitality services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['travel', 'hotel', 'restaurant', 'catering', 'tourism', 'hospitality']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '90000000';

-- Segment 91: Personal & domestic services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['personal', 'domestic', 'household', 'grooming', 'laundry', 'childcare']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '91000000';

-- Segment 92: Defense & public safety services
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['military', 'police', 'fire', 'emergency', 'security', 'defense']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '92000000';

-- Segment 93: Politics & civic affairs
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['government', 'political', 'civic', 'legislative', 'regulatory', 'public']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '93000000';

-- Segment 94: Organizations & clubs
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['membership', 'association', 'nonprofit', 'charity', 'trade', 'union']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '94000000';

-- Segment 95: Land & buildings
UPDATE shared.commodity_code SET keywords = array(SELECT DISTINCT unnest(keywords || ARRAY['real', 'estate', 'property', 'land', 'building', 'infrastructure']) ORDER BY 1)
WHERE domain_code = 'unspsc' AND code = '95000000';


