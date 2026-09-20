-- Bank master data for the countries carrying an account capture profile in
-- control.bank_account_validation_rule, with Saudi Arabia, Malaysia and Egypt
-- expanded to their principal licensed banks for end-to-end testing.
--
-- PROVENANCE, read before trusting a value for payment routing:
--   * Institutions and their ISO 9362 BICs are authored from the BIC directory.
--     DBSSSGSG, MBBEMYKL and MIDLGB22 are carried over verbatim from the retired
--     seed/reference/bank-directory/development.v1.json, which sourced them from
--     the banks' own published payment guides. The rest have NOT been diffed
--     against a fetched registry copy.
--   * Saudi national bank codes are the two digits SAMA embeds at positions 5-6
--     of every Saudi IBAN, so each is checkable against any statement from that
--     bank. Malaysia and Egypt carry none: Malaysia has no retail numeric bank
--     code, and the Egyptian four-digit CBE codes were omitted rather than guessed.
--   * Head-office branches carry source 'swift.bic-directory'.
--     Everything under source 'athyper.representative-branch' is
--     SYNTHETIC test data — representative branches so branch selection and the
--     branch_code path in shared.v_bank_directory can be exercised. Their
--     national_branch_code values use the scheme_namespace
--     'athyper.representative' precisely so nothing mistakes them for real
--     clearing codes. Remove them with:
--       DELETE FROM shared.bank_identifier WHERE scheme_namespace='athyper.representative';
--       DELETE FROM shared.bank_branch WHERE source='athyper.representative-branch';
--
-- shared.v_bank_directory only surfaces an identifier when exactly one matches,
-- so each institution carries at most one BIC and one national bank code.
--
-- Natural key is (source, source_record_id), carrying the unique indexes
-- bank_institution_source_uq / bank_branch_source_uq. Rows are maintained in
-- place; retire with status/effective_until, never delete.
--
-- The ON CONFLICT clauses below infer those two partial unique indexes, so this
-- file REQUIRES common/shared/06_indexes.sql (section BNK) to have been applied
-- first. The manifests order it that way for every plane; a database topped up
-- without re-running 06_indexes.sql will instead fail with
--   42P10: there is no unique or exclusion constraint matching the ON CONFLICT
--          specification
-- which is fixed by applying that section (its statements are IF NOT EXISTS).

INSERT INTO shared.bank_institution
  (name, country_code, institution_type, effective_from, source, source_record_id)
VALUES
  ('Saudi National Bank','SA','bank','2025-01-01','swift.bic-directory','NCBKSAJE'),
  ('Al Rajhi Bank','SA','bank','2025-01-01','swift.bic-directory','RJHISARI'),
  ('Riyad Bank','SA','bank','2025-01-01','swift.bic-directory','RIBLSARI'),
  ('The Saudi British Bank','SA','bank','2025-01-01','swift.bic-directory','SABBSARI'),
  ('Banque Saudi Fransi','SA','bank','2025-01-01','swift.bic-directory','BSFRSARI'),
  ('Arab National Bank','SA','bank','2025-01-01','swift.bic-directory','ARNBSARI'),
  ('Alinma Bank','SA','bank','2025-01-01','swift.bic-directory','INMASARI'),
  ('Bank Albilad','SA','bank','2025-01-01','swift.bic-directory','ALBISARI'),
  ('Bank Aljazira','SA','bank','2025-01-01','swift.bic-directory','BJAZSAJE'),
  ('The Saudi Investment Bank','SA','bank','2025-01-01','swift.bic-directory','SIBCSARI'),
  ('Malayan Banking Berhad','MY','bank','2025-01-01','swift.bic-directory','MBBEMYKL'),
  ('CIMB Bank Berhad','MY','bank','2025-01-01','swift.bic-directory','CIBBMYKL'),
  ('Public Bank Berhad','MY','bank','2025-01-01','swift.bic-directory','PBBEMYKL'),
  ('RHB Bank Berhad','MY','bank','2025-01-01','swift.bic-directory','RHBBMYKL'),
  ('Hong Leong Bank Berhad','MY','bank','2025-01-01','swift.bic-directory','HLBBMYKL'),
  ('AmBank (M) Berhad','MY','bank','2025-01-01','swift.bic-directory','ARBKMYKL'),
  ('Bank Islam Malaysia Berhad','MY','bank','2025-01-01','swift.bic-directory','BIMBMYKL'),
  ('Affin Bank Berhad','MY','bank','2025-01-01','swift.bic-directory','PHBMMYKL'),
  ('Alliance Bank Malaysia Berhad','MY','bank','2025-01-01','swift.bic-directory','MFBBMYKL'),
  ('Bank Muamalat Malaysia Berhad','MY','bank','2025-01-01','swift.bic-directory','BMMBMYKL'),
  ('OCBC Bank (Malaysia) Berhad','MY','bank','2025-01-01','swift.bic-directory','OCBCMYKL'),
  ('HSBC Bank Malaysia Berhad','MY','bank','2025-01-01','swift.bic-directory','HBMBMYKL'),
  ('Standard Chartered Bank Malaysia Berhad','MY','bank','2025-01-01','swift.bic-directory','SCBLMYKX'),
  ('United Overseas Bank (Malaysia) Bhd','MY','bank','2025-01-01','swift.bic-directory','UOVBMYKL'),
  ('National Bank of Egypt','EG','bank','2025-01-01','swift.bic-directory','NBEGEGCX'),
  ('Banque Misr','EG','bank','2025-01-01','swift.bic-directory','BMISEGCX'),
  ('Commercial International Bank (Egypt) S.A.E.','EG','bank','2025-01-01','swift.bic-directory','CIBEEGCX'),
  ('Banque du Caire','EG','bank','2025-01-01','swift.bic-directory','BCAIEGCX'),
  ('QNB ALAHLI','EG','bank','2025-01-01','swift.bic-directory','QNBAEGCX'),
  ('Arab African International Bank','EG','bank','2025-01-01','swift.bic-directory','ARAIEGCX'),
  ('Faisal Islamic Bank of Egypt','EG','bank','2025-01-01','swift.bic-directory','FIEGEGCX'),
  ('Bank of Alexandria','EG','bank','2025-01-01','swift.bic-directory','ALEXEGCX'),
  ('Credit Agricole Egypt S.A.E.','EG','bank','2025-01-01','swift.bic-directory','AGRIEGCX'),
  ('Housing and Development Bank','EG','bank','2025-01-01','swift.bic-directory','HDBKEGCX'),
  ('Qatar National Bank (Q.P.S.C.)','QA','bank','2025-01-01','swift.bic-directory','QNBAQAQA'),
  ('The Commercial Bank (P.S.Q.C.)','QA','bank','2025-01-01','swift.bic-directory','CBQAQAQA'),
  ('Doha Bank Q.P.S.C.','QA','bank','2025-01-01','swift.bic-directory','DOHBQAQA'),
  ('Emirates NBD Bank PJSC','AE','bank','2025-01-01','swift.bic-directory','EBILAEAD'),
  ('First Abu Dhabi Bank PJSC','AE','bank','2025-01-01','swift.bic-directory','NBADAEAA'),
  ('Abu Dhabi Commercial Bank PJSC','AE','bank','2025-01-01','swift.bic-directory','ADCBAEAA'),
  ('National Bank of Bahrain B.S.C.','BH','bank','2025-01-01','swift.bic-directory','NBOBBHBM'),
  ('Bank of Bahrain and Kuwait B.S.C.','BH','bank','2025-01-01','swift.bic-directory','BBKUBHBM'),
  ('Ahli United Bank B.S.C.','BH','bank','2025-01-01','swift.bic-directory','AUBBBHBM'),
  ('State Bank of India','IN','bank','2025-01-01','swift.bic-directory','SBININBB'),
  ('HDFC Bank Limited','IN','bank','2025-01-01','swift.bic-directory','HDFCINBB'),
  ('ICICI Bank Limited','IN','bank','2025-01-01','swift.bic-directory','ICICINBB'),
  ('JPMorgan Chase Bank, N.A.','US','bank','2025-01-01','swift.bic-directory','CHASUS33'),
  ('Bank of America, N.A.','US','bank','2025-01-01','swift.bic-directory','BOFAUS3N'),
  ('Citibank, N.A.','US','bank','2025-01-01','swift.bic-directory','CITIUS33'),
  ('DBS Bank Ltd','SG','bank','2025-01-01','swift.bic-directory','DBSSSGSG'),
  ('Oversea-Chinese Banking Corporation Limited','SG','bank','2025-01-01','swift.bic-directory','OCBCSGSG'),
  ('United Overseas Bank Limited','SG','bank','2025-01-01','swift.bic-directory','UOVBSGSG'),
  ('HSBC Bank plc','GB','bank','2025-01-01','swift.bic-directory','MIDLGB22')
ON CONFLICT (source, source_record_id) WHERE source IS NOT NULL DO UPDATE
SET name = EXCLUDED.name,
    country_code = EXCLUDED.country_code,
    institution_type = EXCLUDED.institution_type,
    status = 'active',
    effective_until = NULL;

-- Head offices.
INSERT INTO shared.bank_branch
  (institution_id, name, country_code, location, effective_from, source, source_record_id)
SELECT i.id, b.name, b.country_code::character(2), b.location, '2025-01-01'::date,
       'swift.bic-directory', b.source_record_id
FROM (VALUES
  ('NCBKSAJE','Saudi National Bank — Head Office','SA','{"city":"Jeddah"}'::jsonb,'NCBKSAJE.HO'),
  ('RJHISARI','Al Rajhi Bank — Head Office','SA','{"city":"Riyadh"}'::jsonb,'RJHISARI.HO'),
  ('RIBLSARI','Riyad Bank — Head Office','SA','{"city":"Riyadh"}'::jsonb,'RIBLSARI.HO'),
  ('SABBSARI','The Saudi British Bank — Head Office','SA','{"city":"Riyadh"}'::jsonb,'SABBSARI.HO'),
  ('BSFRSARI','Banque Saudi Fransi — Head Office','SA','{"city":"Riyadh"}'::jsonb,'BSFRSARI.HO'),
  ('ARNBSARI','Arab National Bank — Head Office','SA','{"city":"Riyadh"}'::jsonb,'ARNBSARI.HO'),
  ('INMASARI','Alinma Bank — Head Office','SA','{"city":"Riyadh"}'::jsonb,'INMASARI.HO'),
  ('ALBISARI','Bank Albilad — Head Office','SA','{"city":"Riyadh"}'::jsonb,'ALBISARI.HO'),
  ('BJAZSAJE','Bank Aljazira — Head Office','SA','{"city":"Jeddah"}'::jsonb,'BJAZSAJE.HO'),
  ('SIBCSARI','The Saudi Investment Bank — Head Office','SA','{"city":"Riyadh"}'::jsonb,'SIBCSARI.HO'),
  ('MBBEMYKL','Malayan Banking Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'MBBEMYKL.HO'),
  ('CIBBMYKL','CIMB Bank Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'CIBBMYKL.HO'),
  ('PBBEMYKL','Public Bank Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'PBBEMYKL.HO'),
  ('RHBBMYKL','RHB Bank Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'RHBBMYKL.HO'),
  ('HLBBMYKL','Hong Leong Bank Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'HLBBMYKL.HO'),
  ('ARBKMYKL','AmBank (M) Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'ARBKMYKL.HO'),
  ('BIMBMYKL','Bank Islam Malaysia Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'BIMBMYKL.HO'),
  ('PHBMMYKL','Affin Bank Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'PHBMMYKL.HO'),
  ('MFBBMYKL','Alliance Bank Malaysia Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'MFBBMYKL.HO'),
  ('BMMBMYKL','Bank Muamalat Malaysia Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'BMMBMYKL.HO'),
  ('OCBCMYKL','OCBC Bank (Malaysia) Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'OCBCMYKL.HO'),
  ('HBMBMYKL','HSBC Bank Malaysia Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'HBMBMYKL.HO'),
  ('SCBLMYKX','Standard Chartered Bank Malaysia Berhad — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'SCBLMYKX.HO'),
  ('UOVBMYKL','United Overseas Bank (Malaysia) Bhd — Head Office','MY','{"city":"Kuala Lumpur"}'::jsonb,'UOVBMYKL.HO'),
  ('NBEGEGCX','National Bank of Egypt — Head Office','EG','{"city":"Cairo"}'::jsonb,'NBEGEGCX.HO'),
  ('BMISEGCX','Banque Misr — Head Office','EG','{"city":"Cairo"}'::jsonb,'BMISEGCX.HO'),
  ('CIBEEGCX','Commercial International Bank (Egypt) S.A.E. — Head Office','EG','{"city":"Cairo"}'::jsonb,'CIBEEGCX.HO'),
  ('BCAIEGCX','Banque du Caire — Head Office','EG','{"city":"Cairo"}'::jsonb,'BCAIEGCX.HO'),
  ('QNBAEGCX','QNB ALAHLI — Head Office','EG','{"city":"Cairo"}'::jsonb,'QNBAEGCX.HO'),
  ('ARAIEGCX','Arab African International Bank — Head Office','EG','{"city":"Cairo"}'::jsonb,'ARAIEGCX.HO'),
  ('FIEGEGCX','Faisal Islamic Bank of Egypt — Head Office','EG','{"city":"Cairo"}'::jsonb,'FIEGEGCX.HO'),
  ('ALEXEGCX','Bank of Alexandria — Head Office','EG','{"city":"Alexandria"}'::jsonb,'ALEXEGCX.HO'),
  ('AGRIEGCX','Credit Agricole Egypt S.A.E. — Head Office','EG','{"city":"Giza"}'::jsonb,'AGRIEGCX.HO'),
  ('HDBKEGCX','Housing and Development Bank — Head Office','EG','{"city":"Cairo"}'::jsonb,'HDBKEGCX.HO'),
  ('QNBAQAQA','Qatar National Bank (Q.P.S.C.) — Head Office','QA','{"city":"Doha"}'::jsonb,'QNBAQAQA.HO'),
  ('CBQAQAQA','The Commercial Bank (P.S.Q.C.) — Head Office','QA','{"city":"Doha"}'::jsonb,'CBQAQAQA.HO'),
  ('DOHBQAQA','Doha Bank Q.P.S.C. — Head Office','QA','{"city":"Doha"}'::jsonb,'DOHBQAQA.HO'),
  ('EBILAEAD','Emirates NBD Bank PJSC — Head Office','AE','{"city":"Dubai"}'::jsonb,'EBILAEAD.HO'),
  ('NBADAEAA','First Abu Dhabi Bank PJSC — Head Office','AE','{"city":"Abu Dhabi"}'::jsonb,'NBADAEAA.HO'),
  ('ADCBAEAA','Abu Dhabi Commercial Bank PJSC — Head Office','AE','{"city":"Abu Dhabi"}'::jsonb,'ADCBAEAA.HO'),
  ('NBOBBHBM','National Bank of Bahrain B.S.C. — Head Office','BH','{"city":"Manama"}'::jsonb,'NBOBBHBM.HO'),
  ('BBKUBHBM','Bank of Bahrain and Kuwait B.S.C. — Head Office','BH','{"city":"Manama"}'::jsonb,'BBKUBHBM.HO'),
  ('AUBBBHBM','Ahli United Bank B.S.C. — Head Office','BH','{"city":"Manama"}'::jsonb,'AUBBBHBM.HO'),
  ('SBININBB','State Bank of India — Head Office','IN','{"city":"Mumbai"}'::jsonb,'SBININBB.HO'),
  ('HDFCINBB','HDFC Bank Limited — Head Office','IN','{"city":"Mumbai"}'::jsonb,'HDFCINBB.HO'),
  ('ICICINBB','ICICI Bank Limited — Head Office','IN','{"city":"Mumbai"}'::jsonb,'ICICINBB.HO'),
  ('CHASUS33','JPMorgan Chase Bank, N.A. — Head Office','US','{"city":"New York"}'::jsonb,'CHASUS33.HO'),
  ('BOFAUS3N','Bank of America, N.A. — Head Office','US','{"city":"Charlotte"}'::jsonb,'BOFAUS3N.HO'),
  ('CITIUS33','Citibank, N.A. — Head Office','US','{"city":"New York"}'::jsonb,'CITIUS33.HO'),
  ('DBSSSGSG','DBS Bank Ltd — Head Office','SG','{"city":"Singapore"}'::jsonb,'DBSSSGSG.HO'),
  ('OCBCSGSG','Oversea-Chinese Banking Corporation Limited — Head Office','SG','{"city":"Singapore"}'::jsonb,'OCBCSGSG.HO'),
  ('UOVBSGSG','United Overseas Bank Limited — Head Office','SG','{"city":"Singapore"}'::jsonb,'UOVBSGSG.HO'),
  ('MIDLGB22','HSBC Bank plc — Head Office','GB','{"city":"London"}'::jsonb,'MIDLGB22.HO')
) AS b(bic, name, country_code, location, source_record_id)
JOIN shared.bank_institution i
  ON i.source = 'swift.bic-directory' AND i.source_record_id = b.bic
ON CONFLICT (source, source_record_id) WHERE source IS NOT NULL DO UPDATE
SET institution_id = EXCLUDED.institution_id, name = EXCLUDED.name,
    country_code = EXCLUDED.country_code, location = EXCLUDED.location,
    status = 'active', effective_until = NULL;

-- SYNTHETIC representative branches (see PROVENANCE above).
INSERT INTO shared.bank_branch
  (institution_id, name, country_code, location, effective_from, source, source_record_id)
SELECT i.id, b.name, b.country_code::character(2), b.location, '2025-01-01'::date,
       'athyper.representative-branch', b.source_record_id
FROM (VALUES
  ('NCBKSAJE','Saudi National Bank — Riyadh Olaya Branch','SA','{"city":"Riyadh"}'::jsonb,'NCBKSAJE.B01'),
  ('NCBKSAJE','Saudi National Bank — Dammam Corniche Branch','SA','{"city":"Dammam"}'::jsonb,'NCBKSAJE.B02'),
  ('RJHISARI','Al Rajhi Bank — Jeddah Tahlia Branch','SA','{"city":"Jeddah"}'::jsonb,'RJHISARI.B01'),
  ('RJHISARI','Al Rajhi Bank — Makkah Al Aziziyah Branch','SA','{"city":"Makkah"}'::jsonb,'RJHISARI.B02'),
  ('RIBLSARI','Riyad Bank — Khobar Prince Faisal Branch','SA','{"city":"Al Khobar"}'::jsonb,'RIBLSARI.B01'),
  ('MBBEMYKL','Malayan Banking Berhad — Menara Maybank Branch','MY','{"city":"Kuala Lumpur"}'::jsonb,'MBBEMYKL.B01'),
  ('MBBEMYKL','Malayan Banking Berhad — Penang Beach Street Branch','MY','{"city":"George Town"}'::jsonb,'MBBEMYKL.B02'),
  ('CIBBMYKL','CIMB Bank Berhad — Jalan Tun Perak Branch','MY','{"city":"Kuala Lumpur"}'::jsonb,'CIBBMYKL.B01'),
  ('CIBBMYKL','CIMB Bank Berhad — Johor Bahru City Branch','MY','{"city":"Johor Bahru"}'::jsonb,'CIBBMYKL.B02'),
  ('PBBEMYKL','Public Bank Berhad — Menara Public Bank Branch','MY','{"city":"Kuala Lumpur"}'::jsonb,'PBBEMYKL.B01'),
  ('NBEGEGCX','National Bank of Egypt — Cairo Kasr El Nil Branch','EG','{"city":"Cairo"}'::jsonb,'NBEGEGCX.B01'),
  ('NBEGEGCX','National Bank of Egypt — Alexandria Saad Zaghloul Branch','EG','{"city":"Alexandria"}'::jsonb,'NBEGEGCX.B02'),
  ('BMISEGCX','Banque Misr — Cairo Talaat Harb Branch','EG','{"city":"Cairo"}'::jsonb,'BMISEGCX.B01'),
  ('BMISEGCX','Banque Misr — Giza Dokki Branch','EG','{"city":"Giza"}'::jsonb,'BMISEGCX.B02'),
  ('CIBEEGCX','Commercial International Bank (Egypt) S.A.E. — Smart Village Branch','EG','{"city":"Giza"}'::jsonb,'CIBEEGCX.B01')
) AS b(bic, name, country_code, location, source_record_id)
JOIN shared.bank_institution i
  ON i.source = 'swift.bic-directory' AND i.source_record_id = b.bic
ON CONFLICT (source, source_record_id) WHERE source IS NOT NULL DO UPDATE
SET institution_id = EXCLUDED.institution_id, name = EXCLUDED.name,
    country_code = EXCLUDED.country_code, location = EXCLUDED.location,
    status = 'active', effective_until = NULL;

-- bank_identifier has no unique index: uniqueness is the GiST exclusion
-- constraint over (scheme, namespace, jurisdiction, value, validity), which
-- ON CONFLICT cannot target.
INSERT INTO shared.bank_identifier
  (institution_id, scheme, scheme_namespace, jurisdiction, value, effective_from)
SELECT i.id, x.scheme, x.scheme_namespace, x.jurisdiction::character(2), x.value, '2025-01-01'::date
FROM (VALUES
  ('NCBKSAJE','bic','iso9362','SA','NCBKSAJE'),
  ('RJHISARI','bic','iso9362','SA','RJHISARI'),
  ('RIBLSARI','bic','iso9362','SA','RIBLSARI'),
  ('SABBSARI','bic','iso9362','SA','SABBSARI'),
  ('BSFRSARI','bic','iso9362','SA','BSFRSARI'),
  ('ARNBSARI','bic','iso9362','SA','ARNBSARI'),
  ('INMASARI','bic','iso9362','SA','INMASARI'),
  ('ALBISARI','bic','iso9362','SA','ALBISARI'),
  ('BJAZSAJE','bic','iso9362','SA','BJAZSAJE'),
  ('SIBCSARI','bic','iso9362','SA','SIBCSARI'),
  ('MBBEMYKL','bic','iso9362','MY','MBBEMYKL'),
  ('CIBBMYKL','bic','iso9362','MY','CIBBMYKL'),
  ('PBBEMYKL','bic','iso9362','MY','PBBEMYKL'),
  ('RHBBMYKL','bic','iso9362','MY','RHBBMYKL'),
  ('HLBBMYKL','bic','iso9362','MY','HLBBMYKL'),
  ('ARBKMYKL','bic','iso9362','MY','ARBKMYKL'),
  ('BIMBMYKL','bic','iso9362','MY','BIMBMYKL'),
  ('PHBMMYKL','bic','iso9362','MY','PHBMMYKL'),
  ('MFBBMYKL','bic','iso9362','MY','MFBBMYKL'),
  ('BMMBMYKL','bic','iso9362','MY','BMMBMYKL'),
  ('OCBCMYKL','bic','iso9362','MY','OCBCMYKL'),
  ('HBMBMYKL','bic','iso9362','MY','HBMBMYKL'),
  ('SCBLMYKX','bic','iso9362','MY','SCBLMYKX'),
  ('UOVBMYKL','bic','iso9362','MY','UOVBMYKL'),
  ('NBEGEGCX','bic','iso9362','EG','NBEGEGCX'),
  ('BMISEGCX','bic','iso9362','EG','BMISEGCX'),
  ('CIBEEGCX','bic','iso9362','EG','CIBEEGCX'),
  ('BCAIEGCX','bic','iso9362','EG','BCAIEGCX'),
  ('QNBAEGCX','bic','iso9362','EG','QNBAEGCX'),
  ('ARAIEGCX','bic','iso9362','EG','ARAIEGCX'),
  ('FIEGEGCX','bic','iso9362','EG','FIEGEGCX'),
  ('ALEXEGCX','bic','iso9362','EG','ALEXEGCX'),
  ('AGRIEGCX','bic','iso9362','EG','AGRIEGCX'),
  ('HDBKEGCX','bic','iso9362','EG','HDBKEGCX'),
  ('QNBAQAQA','bic','iso9362','QA','QNBAQAQA'),
  ('CBQAQAQA','bic','iso9362','QA','CBQAQAQA'),
  ('DOHBQAQA','bic','iso9362','QA','DOHBQAQA'),
  ('EBILAEAD','bic','iso9362','AE','EBILAEAD'),
  ('NBADAEAA','bic','iso9362','AE','NBADAEAA'),
  ('ADCBAEAA','bic','iso9362','AE','ADCBAEAA'),
  ('NBOBBHBM','bic','iso9362','BH','NBOBBHBM'),
  ('BBKUBHBM','bic','iso9362','BH','BBKUBHBM'),
  ('AUBBBHBM','bic','iso9362','BH','AUBBBHBM'),
  ('SBININBB','bic','iso9362','IN','SBININBB'),
  ('HDFCINBB','bic','iso9362','IN','HDFCINBB'),
  ('ICICINBB','bic','iso9362','IN','ICICINBB'),
  ('CHASUS33','bic','iso9362','US','CHASUS33'),
  ('BOFAUS3N','bic','iso9362','US','BOFAUS3N'),
  ('CITIUS33','bic','iso9362','US','CITIUS33'),
  ('DBSSSGSG','bic','iso9362','SG','DBSSSGSG'),
  ('OCBCSGSG','bic','iso9362','SG','OCBCSGSG'),
  ('UOVBSGSG','bic','iso9362','SG','UOVBSGSG'),
  ('MIDLGB22','bic','iso9362','GB','MIDLGB22'),
  ('NCBKSAJE','national_bank_code','sama','SA','10'),
  ('RJHISARI','national_bank_code','sama','SA','80'),
  ('RIBLSARI','national_bank_code','sama','SA','20'),
  ('SABBSARI','national_bank_code','sama','SA','45'),
  ('BSFRSARI','national_bank_code','sama','SA','55'),
  ('ARNBSARI','national_bank_code','sama','SA','30'),
  ('INMASARI','national_bank_code','sama','SA','05'),
  ('ALBISARI','national_bank_code','sama','SA','15'),
  ('BJAZSAJE','national_bank_code','sama','SA','60'),
  ('SIBCSARI','national_bank_code','sama','SA','65')
) AS x(bic, scheme, scheme_namespace, jurisdiction, value)
JOIN shared.bank_institution i
  ON i.source = 'swift.bic-directory' AND i.source_record_id = x.bic
WHERE NOT EXISTS (
    SELECT 1 FROM shared.bank_identifier e
     WHERE e.institution_id = i.id AND e.branch_id IS NULL
       AND e.scheme = x.scheme AND e.scheme_namespace = x.scheme_namespace
       AND e.value = x.value
);

-- SYNTHETIC branch codes for the representative branches (see PROVENANCE above).
INSERT INTO shared.bank_identifier
  (institution_id, branch_id, scheme, scheme_namespace, jurisdiction, value, effective_from)
SELECT b.institution_id, b.id, x.scheme, x.scheme_namespace,
       x.jurisdiction::character(2), x.value, '2025-01-01'::date
FROM (VALUES
  ('NCBKSAJE.B01','national_branch_code','athyper.representative','SA','NCBK0001'),
  ('NCBKSAJE.B02','national_branch_code','athyper.representative','SA','NCBK0002'),
  ('RJHISARI.B01','national_branch_code','athyper.representative','SA','RJHI0001'),
  ('RJHISARI.B02','national_branch_code','athyper.representative','SA','RJHI0002'),
  ('RIBLSARI.B01','national_branch_code','athyper.representative','SA','RIBL0001'),
  ('MBBEMYKL.B01','national_branch_code','athyper.representative','MY','MBBE0001'),
  ('MBBEMYKL.B02','national_branch_code','athyper.representative','MY','MBBE0002'),
  ('CIBBMYKL.B01','national_branch_code','athyper.representative','MY','CIBB0001'),
  ('CIBBMYKL.B02','national_branch_code','athyper.representative','MY','CIBB0002'),
  ('PBBEMYKL.B01','national_branch_code','athyper.representative','MY','PBBE0001'),
  ('NBEGEGCX.B01','national_branch_code','athyper.representative','EG','NBEG0001'),
  ('NBEGEGCX.B02','national_branch_code','athyper.representative','EG','NBEG0002'),
  ('BMISEGCX.B01','national_branch_code','athyper.representative','EG','BMIS0001'),
  ('BMISEGCX.B02','national_branch_code','athyper.representative','EG','BMIS0002'),
  ('CIBEEGCX.B01','national_branch_code','athyper.representative','EG','CIBE0001')
) AS x(branch_record, scheme, scheme_namespace, jurisdiction, value)
JOIN shared.bank_branch b
  ON b.source = 'athyper.representative-branch' AND b.source_record_id = x.branch_record
WHERE NOT EXISTS (
    SELECT 1 FROM shared.bank_identifier e
     WHERE e.institution_id = b.institution_id AND e.branch_id = b.id
       AND e.scheme = x.scheme AND e.scheme_namespace = x.scheme_namespace
       AND e.value = x.value
);
