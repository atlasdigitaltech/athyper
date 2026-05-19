-- security/900_decommission_legacy_numbering.sql
-- Purpose: remove legacy numbering artifacts after canonical entity numbering.
-- Canonical path: control.entity_numbering_config/counter + control.next_entity_number().

DROP FUNCTION IF EXISTS control.next_document_number(uuid, text, text, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS master.fn_next_document_number(uuid, uuid, text, smallint);

DROP TABLE IF EXISTS document.document_sequence_counter CASCADE;
DROP TABLE IF EXISTS document.document_sequence_config CASCADE;
DROP TABLE IF EXISTS control.document_sequence_counter CASCADE;
DROP TABLE IF EXISTS control.document_sequence_config CASCADE;
DROP TABLE IF EXISTS master.numbering_series CASCADE;

ALTER TABLE IF EXISTS control.entity
    DROP COLUMN IF EXISTS naming_policy;
