/**
 * @athyper/api-contracts — Ledger Schemas
 *
 * Read-oriented shapes for ledger.* entities (ledger/ runtime).
 * Mirrors: ledger.journal_entry, ledger.posting_line, aggregate.account_balance.
 */
import { z } from "zod";
import { UuidSchema, MoneySchema } from "./common";

export const JournalEntrySchema = z.object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  journal_number: z.string(),
  journal_type: z.string(),
  posting_date: z.string().datetime(),
  period_code: z.string(),
  status: z.string(),
  source_document_type: z.string().nullable(),
  source_document_id: UuidSchema.nullable(),
  description: z.string().nullable(),
  total_debit: MoneySchema,
  total_credit: MoneySchema,
  line_count: z.number().int(),
  created_at: z.string().datetime(),
  created_by: UuidSchema,
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

export const PostingLineSchema = z.object({
  id: UuidSchema,
  journal_entry_id: UuidSchema,
  line_number: z.number().int(),
  account_code: z.string(),
  account_name: z.string().nullable(),
  cost_center_code: z.string().nullable(),
  debit_amount: z.number(),
  credit_amount: z.number(),
  currency_code: z.string().length(3),
  description: z.string().nullable(),
  dimensions: z.record(z.string(), z.string()).nullable(),
});

export type PostingLine = z.infer<typeof PostingLineSchema>;

export const AccountBalanceSchema = z.object({
  account_code: z.string(),
  account_name: z.string(),
  period_code: z.string(),
  opening_balance: MoneySchema,
  total_debit: MoneySchema,
  total_credit: MoneySchema,
  closing_balance: MoneySchema,
});

export type AccountBalance = z.infer<typeof AccountBalanceSchema>;

/** Posting trace — links a document to its journal entries. */
export const PostingTraceSchema = z.object({
  document_type: z.string(),
  document_id: UuidSchema,
  document_number: z.string(),
  journal_entries: z.array(z.object({
    journal_id: UuidSchema,
    journal_number: z.string(),
    posting_date: z.string().datetime(),
    line_count: z.number().int(),
  })),
});

export type PostingTrace = z.infer<typeof PostingTraceSchema>;
