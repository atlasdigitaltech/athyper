-- Shared lookup data: currencies, countries, UoM, and standard codes
CREATE SCHEMA IF NOT EXISTS shared;

-- Access control, permissions, metadata/lookup registry, policy rules, lifecycle & workflow engines
CREATE SCHEMA IF NOT EXISTS control;

-- Master data: organizations, tenants, users, and core business entities
CREATE SCHEMA IF NOT EXISTS master;

-- Transactional documents: invoices, credit notes, payments, and journal entries
CREATE SCHEMA IF NOT EXISTS document;

-- General ledger, chart of accounts, fiscal periods, and financial postings
CREATE SCHEMA IF NOT EXISTS ledger;

-- Audit trails, change logs, and activity history
CREATE SCHEMA IF NOT EXISTS log;

-- Domain events, event store, and outbox for event-driven processing
CREATE SCHEMA IF NOT EXISTS event;

-- Approval workflows, period close orchestration, and compliance governance
CREATE SCHEMA IF NOT EXISTS governance;

-- Point-in-time snapshots for reporting, close cycles, and versioned state
CREATE SCHEMA IF NOT EXISTS snapshot;

-- Pre-computed aggregates, balances, KPIs, and materialized summaries
CREATE SCHEMA IF NOT EXISTS aggregate;
