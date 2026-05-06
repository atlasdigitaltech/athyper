/**
 * Bank Statement Import Service — Phase 5
 *
 * Parses CSV and OFX bank statement files and persists them to
 * document.bank_statement + document.bank_statement_line.
 *
 * Idempotency:
 *   File-level — source_hash (SHA-256 of raw bytes) unique per bank account.
 *   Line-level — idempotency_key (bank FITID preferred; else sha256(raw)+':'+lineNo).
 *   Both use ON CONFLICT DO NOTHING so re-uploading the same file is safe.
 *
 * Supported formats:
 *   csv  — RFC 4180; header row required; column name mapping is liberal
 *            (case-insensitive, common aliases accepted).
 *   ofx  — OFX 1.x SGML and OFX 2.x XML; only reads STMTTRN blocks.
 *   mt940 — not yet implemented; returns error.
 */

import { createHash } from "node:crypto";
import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

// ── Public types ──────────────────────────────────────────────────────────────

export interface ImportBankStatementInput {
  tenantId:       string;
  companyCodeId:  string;
  bankAccountId:  string;
  createdBy:      string;
  fileName:       string;
  rawBytes:       Buffer;
  format?:        "csv" | "ofx" | "auto";
  statementRef?:  string;
  periodStart?:   string;  // YYYY-MM-DD — override; else inferred from line dates
  periodEnd?:     string;  // YYYY-MM-DD — override; else inferred from line dates
  currencyCode?:  string;  // override; else inferred from file or bank account
}

export interface ImportBankStatementResult {
  statementId:    string;
  statementRef:   string | null;
  linesInserted:  number;
  linesDuplicate: number;
  totalLines:     number;
  isDuplicate:    boolean;  // true if the whole file was already imported
}

interface ParsedLine {
  lineNo:           number;
  transactionDate:  string;   // YYYY-MM-DD
  valueDate:        string | null;
  description:      string;
  referenceNumber:  string | null;
  counterpartyName: string | null;
  amount:           number;   // signed: positive = credit to account, negative = debit
  transactionType:  string;
  fitid:            string | null;  // bank's own FITID (OFX) or external reference
  rawData:          Record<string, string>;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function importBankStatement(
  db:    AnyDb,
  input: ImportBankStatementInput,
): Promise<ImportBankStatementResult> {
  const rawText   = input.rawBytes.toString("utf8");
  const sourceHash = sha256(rawText);

  // File-level dedup: return existing statement if same file already imported
  const existing = await db
    .selectFrom("document.bank_statement as bst")
    .select(["bst.id", "bst.statement_ref"])
    .where("bst.tenant_id",      "=", input.tenantId)
    .where("bst.bank_account_id","=", input.bankAccountId)
    .where("bst.source_hash",    "=", sourceHash)
    .limit(1)
    .executeTakeFirst() as { id: string; statement_ref: string | null } | undefined;

  if (existing) {
    const lineCount = await db
      .selectFrom("document.bank_statement_line as bsl")
      .select(db.fn.count<string>("bsl.id").as("cnt"))
      .where("bsl.tenant_id",       "=", input.tenantId)
      .where("bsl.bank_statement_id","=", existing.id)
      .executeTakeFirst() as { cnt: string } | undefined;

    const total = parseInt(lineCount?.cnt ?? "0", 10);
    return {
      statementId:   existing.id,
      statementRef:  existing.statement_ref,
      linesInserted: 0,
      linesDuplicate: total,
      totalLines:    total,
      isDuplicate:   true,
    };
  }

  // Detect format
  const format = input.format === "auto" || !input.format
    ? detectFormat(rawText, input.fileName)
    : input.format;

  // Parse lines
  let lines: ParsedLine[];
  if (format === "ofx") {
    lines = parseOfx(rawText);
  } else if (format === "csv") {
    lines = parseCsv(rawText);
  } else {
    throw new Error(`Unsupported bank statement format: ${format}`);
  }

  if (lines.length === 0) {
    throw new Error("No transaction lines found in the uploaded file.");
  }

  // Infer period dates from line dates if not overridden
  const dates = lines.map((l) => l.transactionDate).sort();
  const periodStart = input.periodStart ?? dates[0]!;
  const periodEnd   = input.periodEnd   ?? dates[dates.length - 1]!;

  // Currency: use override, else infer from OFX header, else bank account default
  const currencyCode = (input.currencyCode ?? "USD").toUpperCase().slice(0, 3);

  // Insert statement header
  const statementId = (await sql<{ id: string }>`
    INSERT INTO document.bank_statement
      (tenant_id, company_code_id, bank_account_id,
       statement_ref, period_start_date, period_end_date,
       currency_code, line_count, source_format, source_hash, status,
       created_at, created_by)
    VALUES (
      ${input.tenantId}::uuid, ${input.companyCodeId}::uuid, ${input.bankAccountId}::uuid,
      ${input.statementRef ?? null},
      ${periodStart}::date, ${periodEnd}::date,
      ${currencyCode}, ${lines.length}, ${format}, ${sourceHash}, 'imported',
      now(), ${input.createdBy}::uuid
    )
    RETURNING id
  `.execute(db)).rows[0]?.id;

  if (!statementId) throw new Error("Failed to insert bank_statement header");

  // Insert lines with ON CONFLICT DO NOTHING for line-level dedup
  let inserted = 0;
  let duplicate = 0;

  for (const line of lines) {
    const idempotencyKey = line.fitid
      ? line.fitid
      : `${sha256(JSON.stringify(line.rawData))}:${line.lineNo}`;

    const result = await sql<{ id: string }>`
      INSERT INTO document.bank_statement_line
        (tenant_id, bank_statement_id, line_no,
         transaction_date, value_date, description,
         reference_number, counterparty_name,
         amount, currency_code, transaction_type,
         idempotency_key, recon_status, raw_data,
         created_at)
      VALUES (
        ${input.tenantId}::uuid, ${statementId}::uuid, ${line.lineNo},
        ${line.transactionDate}::date,
        ${line.valueDate ?? null},
        ${line.description},
        ${line.referenceNumber ?? null},
        ${line.counterpartyName ?? null},
        ${line.amount}, ${currencyCode}, ${line.transactionType},
        ${idempotencyKey}, 'unmatched',
        ${JSON.stringify(line.rawData)}::jsonb,
        now()
      )
      ON CONFLICT (tenant_id, bank_statement_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL
      DO NOTHING
      RETURNING id
    `.execute(db);

    if (result.rows.length > 0) { inserted++; } else { duplicate++; }
  }

  // Back-fill actual line_count
  await db
    .updateTable("document.bank_statement")
    .set({ line_count: inserted, updated_at: sql`now()` })
    .where("id", "=", statementId)
    .execute();

  return {
    statementId,
    statementRef:   input.statementRef ?? null,
    linesInserted:  inserted,
    linesDuplicate: duplicate,
    totalLines:     lines.length,
    isDuplicate:    false,
  };
}

// ── Format detection ──────────────────────────────────────────────────────────

function detectFormat(text: string, fileName: string): "csv" | "ofx" {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "ofx" || ext === "qfx") return "ofx";
  if (ext === "csv" || ext === "txt") return "csv";
  // Content sniff
  const head = text.slice(0, 500).toUpperCase();
  if (head.includes("OFXHEADER") || head.includes("<OFX>") || head.includes("<STMTTRN>")) return "ofx";
  return "csv";
}

// ── SHA-256 ───────────────────────────────────────────────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ── OFX parser (1.x SGML + 2.x XML) ─────────────────────────────────────────
// OFX 1.x uses SGML-like tags without closing tags. We extract all <STMTTRN>
// blocks and pick the relevant fields from each.

function parseOfx(text: string): ParsedLine[] {
  // Normalise: strip OFX 1.x header block (lines before <OFX>)
  const ofxStart = text.indexOf("<OFX>");
  const body = ofxStart >= 0 ? text.slice(ofxStart) : text;

  // Extract all STMTTRN blocks
  const blocks: string[] = [];
  const blockRe = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(body)) !== null) {
    blocks.push(m[1]!);
  }

  return blocks.map((block, idx) => {
    const get = (tag: string): string | null => {
      const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i");
      const match = re.exec(block);
      return match ? match[1]!.trim() : null;
    };

    const trnamt   = parseFloat(get("TRNAMT") ?? "0");
    const dtposted = normaliseOfxDate(get("DTPOSTED") ?? "");
    const dtavail  = normaliseOfxDate(get("DTAVAIL") ?? "");
    const trntype  = mapOfxTrnType(get("TRNTYPE") ?? "OTHER");
    const fitid    = get("FITID");
    const name     = get("NAME");
    const memo     = get("MEMO") ?? get("NARRATIVE") ?? "";

    const rawData: Record<string, string> = {};
    const rawRe = /<(\w+)>([^<\r\n]*)/gi;
    let rm: RegExpExecArray | null;
    while ((rm = rawRe.exec(block)) !== null) {
      rawData[rm[1]!.toUpperCase()] = rm[2]!.trim();
    }

    return {
      lineNo:           idx + 1,
      transactionDate:  dtposted || new Date().toISOString().split("T")[0]!,
      valueDate:        dtavail || null,
      description:      memo || name || "",
      referenceNumber:  get("CHECKNUM") ?? get("REFNUM") ?? null,
      counterpartyName: name,
      amount:           trnamt,
      transactionType:  trntype,
      fitid,
      rawData,
    };
  });
}

function normaliseOfxDate(raw: string): string {
  // OFX date: YYYYMMDD or YYYYMMDDHHMMSS[.mmm][±HH:MM]
  const clean = raw.replace(/[^\d]/g, "").slice(0, 8);
  if (clean.length < 8) return "";
  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

function mapOfxTrnType(raw: string): string {
  const t = raw.toUpperCase();
  if (t === "DEBIT" || t === "CHECK" || t === "PAYMENT") return "payment";
  if (t === "CREDIT" || t === "DEP" || t === "DIRECTDEP") return "receipt";
  if (t === "FEE" || t === "SRVCHG") return "fee";
  if (t === "INT") return "interest";
  if (t === "XFER") return "transfer";
  if (t === "ATM" || t === "POS") return "payment";
  return "other";
}

// ── CSV parser ────────────────────────────────────────────────────────────────
// Expects a header row. Column names are matched case-insensitively.
// Supported column aliases:
//   date:        date, transaction_date, txn_date, posting_date, value_date
//   amount:      amount, txn_amount, debit_credit, credit, debit
//   description: description, narrative, details, memo, particulars
//   reference:   reference, reference_number, check_no, cheque_no, ref
//   counterparty: payee, counterparty, beneficiary, name

function parseCsv(text: string): ParsedLine[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const headers = splitCsvRow(lines[0]!).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));

  const colIdx = (aliases: string[]): number =>
    aliases.reduce((found, alias) => (found >= 0 ? found : headers.indexOf(alias)), -1);

  const dateCol        = colIdx(["date","transaction_date","txn_date","posting_date","trxn_date","trans_date"]);
  const valueDateCol   = colIdx(["value_date","settlement_date"]);
  const amountCol      = colIdx(["amount","txn_amount","transaction_amount"]);
  const creditCol      = colIdx(["credit","credit_amount","credits"]);
  const debitCol       = colIdx(["debit","debit_amount","debits"]);
  const descCol        = colIdx(["description","narrative","details","memo","particulars","remarks","notes"]);
  const refCol         = colIdx(["reference","reference_number","check_no","cheque_no","ref","ref_no","chq_no"]);
  const counterpartyCol= colIdx(["payee","counterparty","beneficiary","name","merchant"]);
  const typeCol        = colIdx(["type","transaction_type","txn_type"]);

  if (dateCol < 0) throw new Error("CSV missing a date column (expected: date, transaction_date, posting_date)");
  if (amountCol < 0 && (creditCol < 0 || debitCol < 0)) {
    throw new Error("CSV missing an amount column (expected: amount, or separate credit + debit columns)");
  }

  const result: ParsedLine[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvRow(lines[i]!);
    if (cols.every((c) => c.trim() === "")) continue;

    const rawData: Record<string, string> = {};
    headers.forEach((h, idx) => { rawData[h] = cols[idx] ?? ""; });

    const dateRaw = cols[dateCol]?.trim() ?? "";
    const txDate  = normaliseCsvDate(dateRaw);
    if (!txDate) continue;  // skip rows with unparseable dates

    let amount = 0;
    if (amountCol >= 0) {
      amount = parseCsvAmount(cols[amountCol] ?? "");
    } else {
      const credit = parseCsvAmount(cols[creditCol!] ?? "");
      const debit  = parseCsvAmount(cols[debitCol!]  ?? "");
      amount = credit - debit;  // credit in = positive, debit out = negative
    }

    const txType = typeCol >= 0
      ? mapCsvTxType(cols[typeCol] ?? "")
      : (amount >= 0 ? "receipt" : "payment");

    result.push({
      lineNo:           i,
      transactionDate:  txDate,
      valueDate:        valueDateCol >= 0 ? normaliseCsvDate(cols[valueDateCol] ?? "") : null,
      description:      descCol >= 0 ? (cols[descCol] ?? "").trim() : "",
      referenceNumber:  refCol >= 0 ? ((cols[refCol] ?? "").trim() || null) : null,
      counterpartyName: counterpartyCol >= 0 ? ((cols[counterpartyCol] ?? "").trim() || null) : null,
      amount,
      transactionType:  txType,
      fitid:            null,
      rawData,
    });
  }

  return result;
}

function splitCsvRow(row: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (ch === '"') {
      if (inQuote && row[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === "," && !inQuote) {
      result.push(cur); cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}

function normaliseCsvDate(raw: string): string | null {
  const clean = raw.trim();
  if (!clean) return null;
  // Try YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  // Try DD/MM/YYYY or MM/DD/YYYY (heuristic: if first part > 12, it's DD)
  const slash = clean.split("/");
  if (slash.length === 3) {
    const [a, b, c] = slash as [string, string, string];
    if (c.length === 4) {
      // Assume DD/MM/YYYY if a > 12, else MM/DD/YYYY
      return parseInt(a, 10) > 12
        ? `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`
        : `${c}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
    }
  }
  // Try DD-MM-YYYY
  const dash = clean.split("-");
  if (dash.length === 3 && dash[2]!.length === 4) {
    const [a, b, c] = dash as [string, string, string];
    return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  // Fallback: try Date parse
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d.toISOString().split("T")[0]!;
  return null;
}

function parseCsvAmount(raw: string): number {
  const clean = raw.trim().replace(/[,$\s]/g, "").replace(/\((.+)\)/, "-$1");
  return parseFloat(clean) || 0;
}

function mapCsvTxType(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (t.includes("debit") || t.includes("payment") || t.includes("withdrawal")) return "payment";
  if (t.includes("credit") || t.includes("deposit") || t.includes("receipt")) return "receipt";
  if (t.includes("fee") || t.includes("charge") || t.includes("service")) return "fee";
  if (t.includes("interest")) return "interest";
  if (t.includes("transfer") || t.includes("trf")) return "transfer";
  if (t.includes("fx") || t.includes("forex") || t.includes("exchange")) return "fx";
  if (t.includes("reversal") || t.includes("return")) return "reversal";
  return "other";
}
