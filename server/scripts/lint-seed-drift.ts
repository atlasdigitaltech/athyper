#!/usr/bin/env tsx
/**
 * Static seed-drift lint (Batch 5C).
 *
 * Complements the in-DB checks:
 *   - 042o_control_pre_quarantine_field_lint_contract.sql (pre-quarantine)
 *   - 100_control_seed_contract_assertions.sql (post-quarantine)
 *
 * Those need a live DB. This script runs at CI time with no DB, and catches
 * grep-level drift in seed contract files: known-legacy column names that
 * were removed/renamed but keep reappearing in seeds. Every rule ties back
 * to a documented DDL change or Batch 1-4 cleanup.
 *
 * Usage:
 *   npx tsx server/scripts/lint-seed-drift.ts
 *
 * Exit code:
 *   0 â€” no drift detected
 *   1 â€” at least one rule matched
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, join } from "node:path";

type Rule = {
  id: string;
  description: string;
  scope: string[]; // absolute or repo-relative globs
  match: RegExp;
  // Optional guard: if `guard` matches on the same line, the finding is
  // suppressed. Use for lines that are the CORRECT rename target.
  guard?: RegExp;
  suggestion: string;
};

const REPO_ROOT = process.cwd();
const SEED_DIR = "server/db/seed/platform/003_control";

// â”€â”€â”€ Rules â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each rule targets a specific ghost identifier and scopes to the files
// where it must not appear. Rules are additive: new rules can be added as
// new columns are dropped or renamed in DDL.

const RULES: Rule[] = [
  // Batch 1: runtime-breaking display / natural-key drift
  {
    id: "B1.jl.debit",
    description: "journal_line.list_columns must not reference debit_amount/credit_amount (use transaction_debit/transaction_credit)",
    scope: [`${SEED_DIR}/*.sql`],
    match: /\bdebit_amount\b|\bcredit_amount\b/,
    guard: /transaction_debit|transaction_credit/,
    suggestion: "Rename to transaction_debit / transaction_credit (matches DDL 01b_tables_journal.sql:165-171).",
  },
  {
    id: "B1.jlr.ref",
    description: "journal_line_reference must not reference reference_type/reference_id (use ref_type/ref_doc_id)",
    scope: [`${SEED_DIR}/*.sql`],
    match: /'reference_type'|'reference_id'/,
    suggestion: "Rename to 'ref_type' / 'ref_doc_id' (matches DDL 01b_tables_journal.sql).",
  },

  // Batch 2: rename drift
  {
    id: "B2.pr.suggested_supplier",
    description: "purchase_requisition must use suggested_supplier_ids (uuid[]), not suggested_supplier_id",
    scope: [`${SEED_DIR}/*.sql`],
    match: /'suggested_supplier_id'(?!s)/,
    suggestion: "Rename to 'suggested_supplier_ids' (DDL column is uuid[] at 01j_tables_p2p.sql:47).",
  },
  {
    id: "B2.pr.total_estimated",
    description: "purchase_requisition column is total_amount, not total_estimated_amount",
    scope: [`${SEED_DIR}/*.sql`],
    match: /'total_estimated_amount'/,
    suggestion: "Rename to 'total_amount' (matches DDL).",
  },
  {
    id: "B2.je.prior_period",
    description: "journal_entry column is prior_period_flag, not is_prior_period",
    scope: [`${SEED_DIR}/*.sql`],
    match: /'is_prior_period'/,
    suggestion: "Rename to 'prior_period_flag' (matches DDL 01b_tables_journal.sql:74).",
  },
  {
    id: "B2.prl.estimated",
    description: "purchase_requisition_line has unit_price/net_amount, not estimated_unit_price/estimated_amount",
    scope: [`${SEED_DIR}/*.sql`],
    match: /'estimated_unit_price'|'estimated_amount'/,
    suggestion: "Rename to 'unit_price' / 'net_amount' (matches DDL 01j_tables_p2p.sql:166,169).",
  },
  {
    id: "B2.ssl.service_description",
    description: "service_sheet_line uses item_description, not service_description",
    scope: [`${SEED_DIR}/*.sql`],
    match: /'service_description'/,
    suggestion: "Rename to 'item_description' (matches DDL 01j_tables_p2p.sql:906).",
  },

  // Batch 4: PI phase-1-reset ghosts (removed from DDL, must not reappear in seed)
  {
    id: "B4.pi.discount_freight_misc",
    description: "purchase_invoice DDL removed discount_amount / freight_amount / misc_charges_amount / subtotal_amount",
    // Scope narrowed to 042d because payment_entry_allocation (in 042) has a
    // legitimate discount_amount column with the same 'amounts' group_key.
    scope: [`${SEED_DIR}/042d_ap_purchase_invoice_contract.sql`],
    match: /'(discount_amount|freight_amount|misc_charges_amount|subtotal_amount)'\s*,\s*'(amounts|parties|dates|general)'/,
    suggestion: "Column removed from document.purchase_invoice (see 01e_tables_invoice.sql:148-149). Delete the seed reference.",
  },
  {
    id: "B4.pi.retention_pct",
    description: "purchase_invoice has retention_amount but not retention_pct",
    scope: [`${SEED_DIR}/042d_ap_purchase_invoice_contract.sql`, `${SEED_DIR}/042_control_entity_field_contract.sql`],
    match: /\('purchase_invoice','retention_pct'/,
    suggestion: "Column removed. Delete the seed reference.",
  },
  {
    id: "B4.pi.dimensions",
    description: "purchase_invoice header dimensions (cost_center/profit_center/project/site/budget_allocation) moved to accounting_distribution",
    scope: [`${SEED_DIR}/042d_ap_purchase_invoice_contract.sql`],
    match: /\('purchase_invoice','(cost_center_id|profit_center_id|project_id|site_id|budget_allocation_id)'/,
    suggestion: "Header dimensions moved to accounting_distribution. Delete the PI reference.",
  },
  {
    id: "B4.pi.posted_flags",
    description: "purchase_invoice does not have is_posted / posted_at / posted_by columns",
    scope: [`${SEED_DIR}/042d_ap_purchase_invoice_contract.sql`],
    match: /\('purchase_invoice','(is_posted|posted_at|posted_by)'\)/,
    suggestion: "Post state tracked via lifecycle. Delete the seed reference.",
  },
  {
    id: "B4.pil.discount_retention",
    description: "purchase_invoice_line does not have discount_pct / discount_amount / retention_pct / retention_amount columns",
    scope: [`${SEED_DIR}/042d_ap_purchase_invoice_contract.sql`, `${SEED_DIR}/042_control_entity_field_contract.sql`],
    match: /\('purchase_invoice_line','(discount_pct|discount_amount|retention_pct|retention_amount)'/,
    suggestion: "Column not on PIL. Delete the seed reference.",
  },
  {
    id: "B4.receipt.number_posted",
    description: "receipt uses code (not receipt_number) and has no is_posted / posted_at / posted_by / is_reversal / reversal_of_id / operational_closed_at / financial_closed_at",
    scope: [`${SEED_DIR}/042_control_entity_field_contract.sql`],
    // Match only within the receipt IN () list â€” using the ghost identifier as a
    // quoted string literal so we don't false-positive on other tables.
    match: /'receipt_number'|(?:'receipt'.*)?'operational_closed_at'|'financial_closed_at'/,
    suggestion: "Column not on document.receipt. Delete the seed reference.",
  },
  // document_date drift on receipt/service_sheet/delivery_note is caught by
  // the in-DB 042o Â§L1 check (column_name must exist on the entity's physical
  // table). No static rule here â€” regex cannot reliably see which entity
  // block owns a VALUES row without full parsing.

  // Batch 7: source_doc_type polymorphic values must match entity_code (lowercase).
  // Old uppercase enum values ('PURCHASE_INVOICE_LINE' etc.) predated the
  // entity_code alignment and required a LOWER() mapping at descriptor
  // resolution time. Now enforced by DDL CHECK constraints on
  // accounting_distribution / pricing_component / schedule_line; regression
  // guard also fails at CI so PRs don't reintroduce the pattern.
  {
    id: "B7.source_doc_type.uppercase",
    description: "source_doc_type polymorphic values must be lowercase entity_code, not the legacy uppercase enum",
    scope: [
      `${SEED_DIR}/*.sql`,
      "server/db/ddl/planes/neon/document/03_tables.sql",
      "server/db/seed/tenants/neon/010_demo/ap_non_po_demo/*.sql",
      "server/db/seed/blueprints/modules/ap_non_po/*.sql",
    ],
    match: /'(PURCHASE_REQUISITION_LINE|COMMITMENT_LINE|PURCHASE_INVOICE_LINE|RECEIPT_LINE|SERVICE_SHEET_LINE)'/,
    suggestion: "Rename to the lowercase entity_code â€” e.g. 'PURCHASE_INVOICE_LINE' -> 'purchase_invoice_line'. CHECK constraints on ad_source_type_chk / pc_source_doc_type_chk / schl_source_type_chk enforce this at DB level.",
  },

  // Structural: never allow ghost columns in display_config.list_columns arrays.
  // The array form 'ARRAY[...]::text[]' or 'to_jsonb(...)' is the seed
  // definition. We check that the P2P line arrays do not reference 'status'
  // for entities that don't have a status column.
  {
    id: "B1.line.status",
    description: "delivery_note_line / receipt_line / service_sheet_line have no status column; do not include 'status' in list_columns",
    scope: [`${SEED_DIR}/072p_p2p_runtime_contract.sql`, `${SEED_DIR}/042p_p2p_foundation_contract.sql`],
    match: /^\s*\('(delivery_note_line|receipt_line|service_sheet_line)'.*'status'/m,
    suggestion: "Remove 'status' from the list_columns array â€” these line tables carry no status column (see DDL 01j_tables_p2p.sql).",
  },
];

// â”€â”€â”€ Runner â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type Finding = {
  ruleId: string;
  file: string;
  line: number;
  text: string;
  suggestion: string;
};

// Expand a glob like "server/db/seed/platform/003_control/*.sql" or an exact
// file path. Only supports directory + trailing "*.<ext>" or an exact file.
function expandGlob(pattern: string): string[] {
  const abs = join(REPO_ROOT, pattern);
  const starIdx = pattern.indexOf("*");
  if (starIdx === -1) {
    try {
      statSync(abs);
      return [abs];
    } catch {
      return [];
    }
  }
  const dirPart = pattern.slice(0, starIdx).replace(/[\\/]$/, "");
  const filePart = pattern.slice(starIdx); // e.g. "*.sql"
  const suffix = filePart.startsWith("*") ? filePart.slice(1) : filePart;
  const dirAbs = join(REPO_ROOT, dirPart);
  try {
    const entries = readdirSync(dirAbs);
    return entries
      .filter((name) => name.endsWith(suffix))
      .map((name) => join(dirAbs, name));
  } catch {
    return [];
  }
}

function collectFiles(patterns: string[]): string[] {
  const seen = new Set<string>();
  for (const pattern of patterns) {
    for (const p of expandGlob(pattern)) {
      seen.add(p);
    }
  }
  return Array.from(seen).sort();
}

function lintFile(rule: Rule, filePath: string): Finding[] {
  const text = readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!rule.match.test(line)) continue;
    if (rule.guard && rule.guard.test(line)) continue;
    findings.push({
      ruleId: rule.id,
      file: relative(REPO_ROOT, filePath).replaceAll("\\", "/"),
      line: i + 1,
      text: line.trim().slice(0, 160),
      suggestion: rule.suggestion,
    });
  }
  return findings;
}

function run(): number {
  const findings: Finding[] = [];
  for (const rule of RULES) {
    const files = collectFiles(rule.scope);
    for (const file of files) {
      findings.push(...lintFile(rule, file));
    }
  }

  if (findings.length === 0) {
    console.log("[lint-seed-drift] PASSED â€” no ghost identifiers detected.");
    return 0;
  }

  console.error(`[lint-seed-drift] FAILED â€” ${findings.length} finding(s):\n`);
  const byRule = new Map<string, Finding[]>();
  for (const f of findings) {
    if (!byRule.has(f.ruleId)) byRule.set(f.ruleId, []);
    byRule.get(f.ruleId)!.push(f);
  }
  for (const [ruleId, group] of byRule) {
    const rule = RULES.find((r) => r.id === ruleId)!;
    console.error(`â”€â”€ [${ruleId}] ${rule.description}`);
    console.error(`   Suggestion: ${rule.suggestion}`);
    for (const f of group) {
      console.error(`   ${f.file}:${f.line}  ${f.text}`);
    }
    console.error("");
  }
  return 1;
}

process.exit(run());



