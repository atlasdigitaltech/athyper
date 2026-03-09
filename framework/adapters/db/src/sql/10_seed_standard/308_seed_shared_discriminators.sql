/* ============================================================================
   Athyper — Seed Shared Mapping Discriminator Values

   Backfills discriminator_column and discriminator_value for entities
   with mapping_mode = 'shared'. Required before the CHECK constraint
   in 072_transition_gate_fk.sql enforces shared → discriminator.

   Current shared mappings:
     ManualJournalEntry + JournalEntry → fin.journal_entry

   PostgreSQL 16+
   Depends on: 072_transition_gate_fk.sql, 300_meta_entity_registration.sql
   ============================================================================ */

-- ManualJournalEntry: the lifecycle-managed primary entity
UPDATE meta.entity
SET discriminator_column = 'entry_type',
    discriminator_value  = 'manual'
WHERE name = 'ManualJournalEntry'
  AND mapping_mode = 'shared'
  AND discriminator_column IS NULL;

-- JournalEntry: the immutable ledger view entity
UPDATE meta.entity
SET discriminator_column = 'entry_type',
    discriminator_value  = 'auto'
WHERE name = 'JournalEntry'
  AND mapping_mode = 'shared'
  AND discriminator_column IS NULL;
