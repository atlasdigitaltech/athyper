"use client";

/**
 * JournalLinesGrid - read-only GL line view for posted journal entries.
 *
 * Columns: #, GL Account, Description, Subledger, Debit, Credit
 * Financial footer: Total Debit | Total Credit
 *
 * Data arrives as DocumentLine rows. Field names for accounts, currencies,
 * references, and signed amounts are resolved from metadata config.
 *   data.subledger_type
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Link2, Plus, RotateCcw, Save, Search, Trash2, X } from "lucide-react";
import type { DocumentLine } from "@athyper/api-contracts/documents";
import type { CompiledEntity, EntityField } from "@athyper/api-contracts/metadata";
import {
  Button, Input, Skeleton,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@athyper/ui/primitives";
import { fetchLatestFxRate, relayMutate } from "@athyper/runtime-shared/client";
import {
  EntityPicker,
  GlAccountPicker,
  entityRowToPickerOption,
  resolveEntityPickerOptionConfig,
  type EntityPickerOption,
} from "@athyper/runtime-shared/entity-search";
import {
  fmtMoney,
  fmtMoneyNumber,
  resolveCurrencyMinorUnits,
  resolveMoneyFieldConfig,
  resolveMoneyFieldFormat,
  type CurrencyCodePosition,
} from "@athyper/runtime-shared/core";
import { cn } from "@athyper/theme/utils";
import {
  asConfigRecord,
  stringArrayConfig,
  textConfig,
} from "../documentRuntimeDefaults";

type JournalLineDraft = {
  key: string;
  gl_account_code: string;
  gl_account_label: string;
  description: string;
  transaction_currency: string;
  debit: string;
  credit: string;
  subledger_type?: string | null;
  reference: JournalLineReferenceDraft;
};

type JournalLineReferenceDraft = {
  target_key: string;
  ref_type: string;
  ref_doc_type: string;
  ref_doc_id: string;
  ref_doc_label: string;
  ref_doc_line_id: string;
  ref_doc_line_label: string;
  ref_doc_number: string;
};

export type JournalLineGridPayload = Record<string, unknown>;

type CurrencyOption = {
  code: string;
  name?: string | null;
  symbol?: string | null;
  minor_units?: number | null;
  status?: string | null;
};

export type JournalExchangeRateStatus = {
  blocking: boolean;
  loading?: boolean;
  message: string | null;
  rate?: number | null;
};

type JournalReferenceTarget = {
  key: string;
  label: string;
  entity: string;
  ref_doc_type: string;
  default_ref_type: string;
  line_selection?: boolean;
  display_fields?: string[];
  search_fields?: string[];
};

const NO_REFERENCE = "__none";

function emptyReference(): JournalLineReferenceDraft {
  return {
    target_key:         "",
    ref_type:           "",
    ref_doc_type:       "",
    ref_doc_id:         "",
    ref_doc_label:      "",
    ref_doc_line_id:    "",
    ref_doc_line_label: "",
    ref_doc_number:     "",
  };
}

function fmtAmt(v: unknown, minorUnits = 2, currencyCode?: string): string {
  return fmtMoneyNumber(v, { minorUnits, currencyCode }) ?? "--";
}

function fmtDisplayMoney(
  v: unknown,
  currencyCode: string,
  minorUnits = 2,
  currencyCodePosition: CurrencyCodePosition = "prefix",
): string {
  return fmtMoney(v, { currencyCode, minorUnits, currencyCodePosition }) ?? "--";
}

function fmtInputAmount(v: unknown, minorUnits = 2): string {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toFixed(minorUnits) : "";
}

function normalizeCurrencyCode(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function fmtExchangeRateInput(value: unknown): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

function positiveExchangeRate(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function postingDateFromContext(context: Record<string, unknown> | null | undefined): string {
  const value =
    context?.["posting_date"] ??
    context?.["document_date"] ??
    context?.["entry_date"] ??
    context?.["date"];
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function fxLookupMissingMessage(fromCurrency: string, toCurrency: string, asOf: string): string {
  return `No active SPOT exchange rate found for ${fromCurrency} to ${toCurrency} as of ${asOf}.`;
}

function sameExchangeRateStatus(a: JournalExchangeRateStatus, b: JournalExchangeRateStatus): boolean {
  return a.blocking === b.blocking &&
    Boolean(a.loading) === Boolean(b.loading) &&
    a.message === b.message &&
    a.rate === b.rate;
}

function useExchangeRateDefault({
  requiresExchangeRate,
  transactionCurrency,
  baseCurrency,
  postingDate,
  exchangeRateValue,
  onExchangeRateChange,
  onStatusChange,
}: {
  requiresExchangeRate: boolean;
  transactionCurrency: string;
  baseCurrency: string;
  postingDate: string;
  exchangeRateValue: string;
  onExchangeRateChange?: (value: string) => void;
  onStatusChange?: (status: JournalExchangeRateStatus) => void;
}): JournalExchangeRateStatus {
  const [status, setStatus] = useState<JournalExchangeRateStatus>({ blocking: false, message: null });
  const onExchangeRateChangeRef = useRef(onExchangeRateChange);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onExchangeRateChangeRef.current = onExchangeRateChange;
  }, [onExchangeRateChange]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const updateStatus = useCallback((next: JournalExchangeRateStatus) => {
    setStatus((prev) => sameExchangeRateStatus(prev, next) ? prev : next);
    onStatusChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    if (!requiresExchangeRate) {
      updateStatus({ blocking: false, message: null });
      return;
    }

    const explicitRate = exchangeRateValue.trim();
    if (explicitRate) {
      const rate = positiveExchangeRate(explicitRate);
      updateStatus(rate === null
        ? { blocking: true, message: "Enter a positive Exchange Rate." }
        : { blocking: false, message: null, rate });
      return;
    }

    const controller = new AbortController();
    updateStatus({
      blocking: true,
      loading:  true,
      message:  "Resolving latest Exchange Rate...",
    });

    void fetchLatestFxRate({
      fromCurrency: transactionCurrency,
      toCurrency:   baseCurrency,
      asOf:         postingDate,
      rateType:     "SPOT",
      signal:       controller.signal,
    }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.rate !== null) {
        const rateValue = String(result.rate);
        onExchangeRateChangeRef.current?.(rateValue);
        updateStatus({ blocking: false, message: null, rate: result.rate });
        return;
      }
      updateStatus({
        blocking: true,
        message:  result.message ?? fxLookupMissingMessage(transactionCurrency, baseCurrency, postingDate),
      });
    }).catch((err) => {
      if (controller.signal.aborted) return;
      updateStatus({
        blocking: true,
        message:  err instanceof Error ? err.message : "Exchange Rate lookup failed.",
      });
    });

    return () => controller.abort();
  }, [
    baseCurrency,
    exchangeRateValue,
    postingDate,
    requiresExchangeRate,
    transactionCurrency,
    updateStatus,
  ]);

  return status;
}

function lineData(line: DocumentLine): Record<string, unknown> {
  return line.data as Record<string, unknown> | null | undefined ?? {};
}

function firstLineDataValue(lines: DocumentLine[], fieldName: string): unknown {
  for (const line of lines) {
    const value = lineData(line)[fieldName];
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function exchangeRateFromLines(lines: DocumentLine[]): string {
  return fmtExchangeRateInput(firstLineDataValue(lines, "exchange_rate"));
}

function journalCurrencyContext(
  record: Record<string, unknown> | undefined,
  lines: DocumentLine[],
  fallbackCurrency: string,
  transactionCurrencyOverride?: string,
) {
  const transactionCurrency = normalizeCurrencyCode(
    transactionCurrencyOverride ??
    record?.["transaction_currency"] ??
    record?.["currency_code"] ??
    firstLineDataValue(lines, "transaction_currency") ??
    fallbackCurrency,
  );
  const baseCurrency = normalizeCurrencyCode(
    record?.["base_currency"] ??
    record?.["base_currency_code"] ??
    firstLineDataValue(lines, "base_currency"),
  );
  return {
    transactionCurrency,
    baseCurrency,
    requiresExchangeRate: Boolean(transactionCurrency && baseCurrency && transactionCurrency !== baseCurrency),
  };
}

const COMMON_CURRENCY_CODES = [
  "USD", "EUR", "GBP", "SAR", "AED", "QAR", "BHD", "INR",
  "JPY", "PHP", "MYR", "SGD", "AUD", "CAD",
];

function compactCurrencySeedKey(seedCodes: Array<string | undefined | null>): string {
  return seedCodes.map(normalizeCurrencyCode).filter(Boolean).join("|");
}

function useCurrencyOptions(seedCodes: Array<string | undefined | null>): CurrencyOption[] {
  const seedKey = compactCurrencySeedKey(seedCodes);
  const [currencies, setCurrencies] = useState<CurrencyOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ limit: "200", status: "active" });
    void fetch(`/api/relay/api/platform/ref/currencies?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => res.ok ? res.json() as Promise<{ data?: CurrencyOption[] }> : { data: [] })
      .then((body) => {
        if (!controller.signal.aborted) setCurrencies(body.data ?? []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCurrencies([]);
      });
    return () => controller.abort();
  }, []);

  return useMemo(() => {
    const byCode = new Map<string, CurrencyOption>();
    const add = (option: Partial<CurrencyOption> & { code?: string | null }) => {
      const code = normalizeCurrencyCode(option.code);
      if (!code) return;
      byCode.set(code, { ...byCode.get(code), ...option, code });
    };

    for (const code of seedKey.split("|")) add({ code });
    for (const code of COMMON_CURRENCY_CODES) add({ code });
    for (const currency of currencies) add(currency);

    return [...byCode.values()];
  }, [currencies, seedKey]);
}

function newDraftLine(currencyCode = ""): JournalLineDraft {
  return {
    key:             `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    gl_account_code: "",
    gl_account_label:"",
    description:     "",
    transaction_currency: normalizeCurrencyCode(currencyCode),
    debit:           "",
    credit:          "",
    reference:        emptyReference(),
  };
}

function payloadLineToDraft(
  line: unknown,
  minorUnits = 2,
  fallbackCurrencyCode = "",
  fieldNames: JournalLineFieldNames = {},
): JournalLineDraft | null {
  if (!line || typeof line !== "object") return null;
  const row = line as Record<string, unknown>;
  const accountField = fieldNames.accountCodePayloadField ?? fieldNames.accountField;
  const descriptionField = fieldNames.descriptionPayloadField;
  const debitField = fieldNames.debitPayloadField ?? fieldNames.debitField;
  const creditField = fieldNames.creditPayloadField ?? fieldNames.creditField;
  const transactionCurrencyField = fieldNames.transactionCurrencyPayloadField ?? fieldNames.transactionCurrencyField;
  const code = String(accountField ? row[accountField] : "").trim();
  const description = String(descriptionField ? row[descriptionField] : "").trim();
  const debit = fmtInputAmount(debitField ? row[debitField] : undefined, minorUnits);
  const credit = fmtInputAmount(creditField ? row[creditField] : undefined, minorUnits);
  const transactionCurrency = normalizeCurrencyCode(
    (transactionCurrencyField ? row[transactionCurrencyField] : undefined) ?? fallbackCurrencyCode,
  );
  if (!code && !description && !debit && !credit && !transactionCurrency) return null;

  return {
    key:              `payload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    gl_account_code:  code,
    gl_account_label: code,
    description,
    transaction_currency: transactionCurrency,
    debit,
    credit,
    reference:        emptyReference(),
  };
}

function normalizeDraftLines(
  value: unknown,
  minRows = 2,
  minorUnits = 2,
  fallbackCurrencyCode = "",
  fieldNames: JournalLineFieldNames = {},
): JournalLineDraft[] {
  const rows = Array.isArray(value)
    ? value.map((line) => payloadLineToDraft(line, minorUnits, fallbackCurrencyCode, fieldNames)).filter((line): line is JournalLineDraft => Boolean(line))
    : [];
  while (rows.length < minRows) rows.push(newDraftLine(fallbackCurrencyCode));
  return rows;
}

function readReferenceTargets(entity?: CompiledEntity): JournalReferenceTarget[] {
  const display = asConfigRecord(entity?.display_config);
  const journalEditor = asConfigRecord(display?.["journal_editor"]);
  const configured = display?.["journal_reference_targets"] ?? journalEditor?.["reference_targets"];
  if (!Array.isArray(configured)) return [];

  const parsed = configured
    .map((entry): JournalReferenceTarget | null => {
      const row = asConfigRecord(entry);
      if (!row) return null;
      const key = textConfig(row["key"]) ?? textConfig(row["ref_doc_type"]);
      const entityCode = textConfig(row["entity"]);
      const refDocType = textConfig(row["ref_doc_type"]) ?? key;
      const label = textConfig(row["label"]) ?? key;
      const defaultRefType = textConfig(row["default_ref_type"]);
      if (!key || !entityCode || !refDocType || !label || !defaultRefType) return null;
      return {
        key,
        label,
        entity: entityCode,
        ref_doc_type: refDocType,
        default_ref_type: defaultRefType,
        line_selection: row["line_selection"] !== false,
        display_fields: stringArrayConfig(row["display_fields"]),
        search_fields:  stringArrayConfig(row["search_fields"]),
      };
    })
    .filter((target): target is JournalReferenceTarget => Boolean(target));

  return parsed;
}

function readJournalLineEntityCode(entity?: CompiledEntity): string {
  const display = asConfigRecord(entity?.display_config);
  const journalEditor = asConfigRecord(display?.["journal_editor"]);
  return textConfig(journalEditor?.["line_entity"])
    ?? textConfig(display?.["line_entity_code"])
    ?? "";
}

type JournalLineFieldNames = {
  accountField?: string;
  debitField?: string;
  creditField?: string;
  transactionCurrencyField?: string;
  accountCodePayloadField?: string;
  debitPayloadField?: string;
  creditPayloadField?: string;
  transactionCurrencyPayloadField?: string;
  descriptionPayloadField?: string;
  referencePayloadField?: string;
};

function readJournalLineFieldNames(
  documentEntity?: CompiledEntity,
  lineEntity?: CompiledEntity | null,
): JournalLineFieldNames {
  const documentDisplay = asConfigRecord(documentEntity?.display_config);
  const journalEditor = asConfigRecord(documentDisplay?.["journal_editor"]);
  const lineDisplay = asConfigRecord(lineEntity?.display_config);
  const fields =
    asConfigRecord(lineDisplay?.["journal_line_fields"]) ??
    asConfigRecord(lineDisplay?.["line_fields"]) ??
    asConfigRecord(documentDisplay?.["journal_line_fields"]) ??
    asConfigRecord(journalEditor?.["fields"]) ??
    {};
  return {
    accountField: textConfig(fields["account_field"]),
    debitField:   textConfig(fields["debit_field"]),
    creditField:  textConfig(fields["credit_field"]),
    transactionCurrencyField: textConfig(fields["transaction_currency_field"]),
    accountCodePayloadField: textConfig(fields["account_code_payload_field"]),
    debitPayloadField: textConfig(fields["debit_payload_field"]),
    creditPayloadField: textConfig(fields["credit_payload_field"]),
    transactionCurrencyPayloadField: textConfig(fields["transaction_currency_payload_field"]),
    descriptionPayloadField: textConfig(fields["description_payload_field"]),
    referencePayloadField: textConfig(fields["reference_payload_field"]),
  };
}

function fieldByName(entity: CompiledEntity | null | undefined, name?: string): EntityField | null {
  if (!name) return null;
  return entity?.fields.find((field) => field.name === name) ?? null;
}

function moneyConfigUsesItemCurrency(field?: EntityField | null): boolean {
  const source = resolveMoneyFieldConfig(field?.money_config).currencySource;
  return source === "item" || source === "line";
}

function resolveLineCurrencyCode(
  field: EntityField | null | undefined,
  header: Record<string, unknown> | null | undefined,
  line: Record<string, unknown>,
  fallbackCurrencyCode: string,
): string {
  return resolveMoneyFieldFormat(field?.money_config, {
    header,
    item: line,
    fallbackCurrencyCode,
  }).currencyCode ?? fallbackCurrencyCode;
}

function lineReferencesEnabled(entity?: CompiledEntity): boolean {
  const featureFlags = entity?.feature_flags as Record<string, unknown> | undefined;
  if (featureFlags?.["line_references"] === false) return false;

  const display = asConfigRecord(entity?.display_config);
  const journalEditor = asConfigRecord(display?.["journal_editor"]);
  const strategy = String(journalEditor?.["line_reference_strategy"] ?? "").trim().toLowerCase();
  return strategy !== "none";
}

function useCompiledEntityMetadata(entityCode: string): CompiledEntity | null {
  const [compiledEntity, setCompiledEntity] = useState<CompiledEntity | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCompiledEntity(null);
    if (!entityCode.trim()) return () => { cancelled = true; };

    void fetch(`/api/relay/api/metadata/entities/${encodeURIComponent(entityCode)}/compiled`)
      .then((res) => res.ok ? res.json() as Promise<CompiledEntity> : null)
      .then((body) => {
        if (!cancelled) setCompiledEntity(body);
      })
      .catch(() => {
        if (!cancelled) setCompiledEntity(null);
      });

    return () => { cancelled = true; };
  }, [entityCode]);

  return compiledEntity;
}

function textFromRecord(row: Record<string, unknown>, fieldName: string | null | undefined): string | undefined {
  if (!fieldName) return undefined;
  const value = row[fieldName];
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return undefined;
}

function textFromValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  return undefined;
}

function referenceTargetEntity(field?: EntityField | null): string {
  const targetEntity = field?.reference_config?.target_entity;
  return typeof targetEntity === "string" && targetEntity.trim() ? targetEntity.trim() : "gl_account";
}

function referenceDisplayField(field?: EntityField | null): string | undefined {
  const displayField = field?.reference_config?.display_field;
  return typeof displayField === "string" && displayField.trim() ? displayField.trim() : undefined;
}

function referenceTargetField(field?: EntityField | null): string {
  const targetField = field?.reference_config?.target_field;
  return typeof targetField === "string" && targetField.trim() ? targetField.trim() : "id";
}

function normalizeEntityCode(value: string): string {
  return value.trim().replace(/-/g, "_");
}

function referenceDataStems(field?: EntityField | null): string[] {
  const targetEntity = normalizeEntityCode(referenceTargetEntity(field));
  const fieldStem = field?.name
    ? field.name.replace(/_(id|uuid)$/i, "")
    : "";
  return [...new Set([fieldStem, targetEntity].filter(Boolean))];
}

function referenceRowFromLine(
  line: DocumentLine,
  field?: EntityField | null,
): Record<string, unknown> {
  const data = lineData(line);
  const stems = referenceDataStems(field);
  const row: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    row[key] = value;
    for (const stem of stems) {
      const prefix = `${stem}_`;
      if (key.startsWith(prefix)) row[key.slice(prefix.length)] ??= value;
    }
  }

  const targetField = referenceTargetField(field);
  if (field?.name && data[field.name] !== undefined) {
    row[targetField] ??= data[field.name];
    row.id ??= data[field.name];
  }
  if (line.item_code !== null && line.item_code !== undefined) {
    row.code ??= line.item_code;
  }

  return row;
}

function referenceOptionFromLine(
  line: DocumentLine,
  field?: EntityField | null,
): EntityPickerOption {
  const optionConfig = resolveEntityPickerOptionConfig(field?.reference_config);
  const targetEntity = referenceTargetEntity(field);
  const row = referenceRowFromLine(line, field);
  return entityRowToPickerOption(row, targetEntity, optionConfig);
}

function sameDisplayText(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function referenceSummaryFromLine(
  line: DocumentLine,
  field?: EntityField | null,
): { primary?: string; secondary?: string; title?: string } {
  const option = referenceOptionFromLine(line, field);
  const row = option.raw ?? {};
  const optionConfig = resolveEntityPickerOptionConfig(field?.reference_config);
  const primary =
    option.label ||
    textFromRecord(row, referenceDisplayField(field)) ||
    textFromValue(line.item_code) ||
    undefined;
  const secondary = optionConfig?.showCode === false
    ? undefined
    : (
        option.code ??
        textFromRecord(row, optionConfig?.codeField) ??
        textFromValue(line.item_code)
      );
  const normalizedSecondary = sameDisplayText(primary, secondary) ? undefined : secondary;
  const title = [primary, normalizedSecondary].filter(Boolean).join(" - ") || undefined;
  return { primary, secondary: normalizedSecondary, title };
}

function labelFromRow(row: Record<string, unknown>, target: JournalReferenceTarget): string {
  const fields = target.display_fields ?? [];
  for (const field of fields) {
    const value = row[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return target.label;
}

function referenceFromLine(line: DocumentLine, targets: JournalReferenceTarget[]): JournalLineReferenceDraft {
  const data = line.data as Record<string, unknown> | null | undefined ?? {};
  const refs = Array.isArray(data["references"]) ? data["references"] as Record<string, unknown>[] : [];
  const first = refs[0];
  if (!first) return emptyReference();

  const refDocType = String(first["ref_doc_type"] ?? "").trim();
  const target = targets.find((t) => t.ref_doc_type === refDocType);
  return {
    target_key:         target?.key ?? refDocType,
    ref_type:           String(first["ref_type"] ?? target?.default_ref_type ?? "").trim(),
    ref_doc_type:       refDocType,
    ref_doc_id:         String(first["ref_doc_id"] ?? "").trim(),
    ref_doc_label:      String(first["ref_doc_number"] ?? first["ref_doc_label"] ?? "").trim(),
    ref_doc_line_id:    String(first["ref_doc_line_id"] ?? "").trim(),
    ref_doc_line_label: String(first["ref_doc_line_label"] ?? "").trim(),
    ref_doc_number:     String(first["ref_doc_number"] ?? "").trim(),
  };
}

function lineToDraft(
  line: DocumentLine,
  targets: JournalReferenceTarget[],
  minorUnits = 2,
  fieldNames: JournalLineFieldNames = {},
  accountField?: EntityField | null,
): JournalLineDraft {
  const d = line.data as Record<string, unknown> | null | undefined ?? {};
  const accountSummary = referenceSummaryFromLine(line, accountField);
  const accountCode = String(line.item_code ?? (fieldNames.accountField ? d[fieldNames.accountField] : "") ?? "").trim();
  const accountLabel = [accountSummary.primary ?? accountCode, accountSummary.secondary]
    .filter(Boolean)
    .map(String)
    .join(" - ");
  return {
    key:             line.id,
    gl_account_code: accountCode,
    gl_account_label: accountLabel,
    description:     String(line.description ?? "").trim(),
    transaction_currency: normalizeCurrencyCode(fieldNames.transactionCurrencyField ? d[fieldNames.transactionCurrencyField] : undefined),
    debit:           fmtInputAmount(fieldNames.debitField ? d[fieldNames.debitField] : undefined, minorUnits),
    credit:          fmtInputAmount(fieldNames.creditField ? d[fieldNames.creditField] : undefined, minorUnits),
    subledger_type:  (d["subledger_type"] as string | null | undefined) ?? null,
    reference:        referenceFromLine(line, targets),
  };
}

function isBlankDraft(line: JournalLineDraft): boolean {
  return !line.gl_account_code.trim() && !line.description.trim() && !line.debit.trim() && !line.credit.trim();
}

function parseDraftAmount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function validateDraftLines(
  lines: JournalLineDraft[],
  includeReferences: boolean,
  minRows = 2,
  minorUnits = 2,
  fieldNames: JournalLineFieldNames = {},
) {
  const active = lines.filter((line) => !isBlankDraft(line));
  const payload: JournalLineGridPayload[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  if (active.length < minRows) {
    return { ok: false, totalDebit, totalCredit, payload, message: `At least ${minRows} journal lines are required.` };
  }

  for (const line of active) {
    const glAccountCode = line.gl_account_code.trim();
    if (!glAccountCode) {
      return { ok: false, totalDebit, totalCredit, payload, message: "GL Account is required on every line." };
    }
    const accountPayloadField = fieldNames.accountCodePayloadField ?? fieldNames.accountField;
    const debitPayloadField = fieldNames.debitPayloadField ?? fieldNames.debitField;
    const creditPayloadField = fieldNames.creditPayloadField ?? fieldNames.creditField;
    if (!accountPayloadField || !debitPayloadField || !creditPayloadField) {
      return { ok: false, totalDebit, totalCredit, payload, message: "Journal line field mapping is missing." };
    }

    const debit = parseDraftAmount(line.debit);
    const credit = parseDraftAmount(line.credit);
    if (debit == null || credit == null || debit < 0 || credit < 0) {
      return { ok: false, totalDebit, totalCredit, payload, message: "Debit and Credit must be valid positive amounts." };
    }
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      return { ok: false, totalDebit, totalCredit, payload, message: "Each line needs either Debit or Credit, not both." };
    }

    totalDebit += debit;
    totalCredit += credit;
    const reference = includeReferences && line.reference.ref_doc_id && line.reference.ref_doc_type
      ? {
          ref_type:           line.reference.ref_type,
          ref_doc_type:       line.reference.ref_doc_type,
          ref_doc_id:         line.reference.ref_doc_id,
          ref_doc_line_id:    line.reference.ref_doc_line_id || null,
          ref_doc_number:     line.reference.ref_doc_number || line.reference.ref_doc_label || null,
          ref_doc_label:      line.reference.ref_doc_label || null,
          ref_doc_line_label: line.reference.ref_doc_line_label || null,
        }
      : undefined;
    const next: Record<string, unknown> = {
      [accountPayloadField]: glAccountCode,
      [debitPayloadField]:   debit > 0 ? debit : undefined,
      [creditPayloadField]:  credit > 0 ? credit : undefined,
    };
    const currencyPayloadField = fieldNames.transactionCurrencyPayloadField ?? fieldNames.transactionCurrencyField;
    const descriptionPayloadField = fieldNames.descriptionPayloadField;
    if (currencyPayloadField) next[currencyPayloadField] = line.transaction_currency || undefined;
    if (descriptionPayloadField) next[descriptionPayloadField] = line.description.trim() || undefined;
    if (reference && fieldNames.referencePayloadField) next[fieldNames.referencePayloadField] = reference;
    payload.push(next);
  }

  if (Math.abs(totalDebit - totalCredit) > 0.001 || totalDebit <= 0) {
    return {
      ok: false,
      totalDebit,
      totalCredit,
      payload,
      message: `Entry is unbalanced by ${fmtAmt(Math.abs(totalDebit - totalCredit), minorUnits)}.`,
    };
  }

  return { ok: true, totalDebit, totalCredit, payload, message: null };
}

function ReferencePicker({
  reference,
  targets,
  disabled,
  onChange,
}: {
  reference: JournalLineReferenceDraft;
  targets: JournalReferenceTarget[];
  disabled?: boolean;
  onChange: (reference: JournalLineReferenceDraft) => void;
}) {
  const selectedTarget = targets.find((target) => target.key === reference.target_key) ?? null;
  const labelCache = useRef<Map<string, string>>(new Map());
  const [lineOptions, setLineOptions] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    setLineOptions([]);

    if (!selectedTarget?.line_selection || !reference.ref_doc_id) return;

    void fetch(`/api/relay/api/records/${encodeURIComponent(selectedTarget.entity)}/${encodeURIComponent(reference.ref_doc_id)}/lines`)
      .then((res) => res.ok ? res.json() : { data: [] })
      .then((body: { data?: DocumentLine[] }) => {
        if (cancelled) return;
        setLineOptions((body.data ?? []).map((line) => ({
          id: line.id,
          label: [`Line ${line.line_number}`, line.item_code, line.description]
            .filter(Boolean)
            .map(String)
            .join(" - "),
        })));
      })
      .catch(() => {
        if (!cancelled) setLineOptions([]);
      });

    return () => { cancelled = true; };
  }, [selectedTarget?.entity, selectedTarget?.line_selection, reference.ref_doc_id]);

  const search = useCallback(async (query: string): Promise<EntityPickerOption[]> => {
    if (!selectedTarget) return [];
    try {
      const params = new URLSearchParams({
        q:         query,
        limit:     "20",
        page_size: "20",
      });
      const res = await fetch(`/api/relay/api/records/${encodeURIComponent(selectedTarget.entity)}?${params.toString()}`);
      if (!res.ok) return [];
      const body = await res.json() as { data?: Record<string, unknown>[] };
      return (body.data ?? [])
        .map((row) => {
          const id = String(row["id"] ?? "").trim();
          const label = labelFromRow(row, selectedTarget);
          if (id) labelCache.current.set(id, label);
          return {
            value:       id,
            label,
            description: typeof row["description"] === "string" ? row["description"] : undefined,
          };
        })
        .filter((option) => option.value);
    } catch {
      return [];
    }
  }, [selectedTarget]);

  return (
    <div className="space-y-1.5">
      <Select
        value={selectedTarget?.key ?? NO_REFERENCE}
        disabled={disabled}
        onValueChange={(value) => {
          if (value === NO_REFERENCE) {
            onChange(emptyReference());
            return;
          }
          const target = targets.find((item) => item.key === value);
          if (!target) return;
          onChange({
            ...emptyReference(),
            target_key:   target.key,
            ref_type:     target.default_ref_type,
            ref_doc_type: target.ref_doc_type,
          });
        }}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="No reference" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_REFERENCE}>No reference</SelectItem>
          {targets.map((target) => (
            <SelectItem key={target.key} value={target.key}>{target.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedTarget && (
        <EntityPicker
          value={reference.ref_doc_id || null}
          displayLabel={reference.ref_doc_label || null}
          onChange={(value) => {
            const id = value ?? "";
            const label = id ? (labelCache.current.get(id) ?? id.slice(0, 8)) : "";
            onChange({
              ...reference,
              ref_doc_id:         id,
              ref_doc_label:      label,
              ref_doc_number:     label,
              ref_doc_line_id:    "",
              ref_doc_line_label: "",
            });
          }}
          search={search}
          loadOnOpen
          placeholder={`Search ${selectedTarget.label.toLowerCase()}...`}
          disabled={disabled}
          clearable
          className="w-full min-w-0"
        />
      )}

      {selectedTarget?.line_selection && reference.ref_doc_id && lineOptions.length > 0 && (
        <Select
          value={reference.ref_doc_line_id || NO_REFERENCE}
          disabled={disabled}
          onValueChange={(value) => {
            if (value === NO_REFERENCE) {
              onChange({ ...reference, ref_doc_line_id: "", ref_doc_line_label: "" });
              return;
            }
            const option = lineOptions.find((item) => item.id === value);
            onChange({
              ...reference,
              ref_doc_line_id:    value,
              ref_doc_line_label: option?.label ?? value.slice(0, 8),
            });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Whole document" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_REFERENCE}>Whole document</SelectItem>
            {lineOptions.map((line) => (
              <SelectItem key={line.id} value={line.id}>{line.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function ReferenceBadge({ references }: { references: unknown }) {
  const refs = Array.isArray(references) ? references as Record<string, unknown>[] : [];
  const first = refs[0];
  if (!first) return <span className="text-muted-foreground/30 text-xs">--</span>;

  const doc = String(first["ref_doc_number"] ?? first["ref_doc_label"] ?? first["ref_doc_id"] ?? "").trim();
  const line = String(first["ref_doc_line_label"] ?? first["ref_doc_line_id"] ?? "").trim();
  const type = String(first["ref_doc_type"] ?? "").replace(/_/g, " ");

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 text-doc-subtitle text-muted-foreground">
      <Link2 className="h-3 w-3 shrink-0" />
      <span className="truncate">{[type, doc, line].filter(Boolean).join(" - ")}</span>
      {refs.length > 1 && <span className="font-medium">+{refs.length - 1}</span>}
    </span>
  );
}
function CurrencyLeadingControl({
  currencyCode,
  options,
  editable,
  disabled,
  onChange,
}: {
  currencyCode: string;
  options: CurrencyOption[];
  editable?: boolean;
  disabled?: boolean;
  onChange?: (currencyCode: string) => void;
}) {
  const code = normalizeCurrencyCode(currencyCode) || "USD";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const filteredOptions = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return options;
    return options.filter((option) =>
      option.code.includes(q) ||
      String(option.name ?? "").toUpperCase().includes(q) ||
      String(option.symbol ?? "").toUpperCase().includes(q),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const codeLabel = (
    <span className="font-mono text-doc-subtitle font-semibold uppercase tracking-normal">
      {code.slice(0, 3)}
    </span>
  );

  if (!editable || disabled) {
    return (
      <div
        className="flex h-full w-9 shrink-0 items-center justify-center border-r border-border/70 bg-muted/40 text-muted-foreground"
        title="Transaction currency"
      >
        {codeLabel}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative h-full w-9 shrink-0">
      <button
        type="button"
        aria-label="Transaction currency"
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
        "flex h-full w-full items-center justify-center border-r border-border/70 bg-muted/40 text-muted-foreground",
          "outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        )}
        onClick={() => {
          setOpen((value) => !value);
          setQuery("");
        }}
      >
        {codeLabel}
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-50 w-56 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <div className="border-b p-1">
            <input
              className="h-7 w-full rounded-sm bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search currency..."
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">No currencies</div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option.code}
                  type="button"
                  role="option"
                  aria-selected={option.code === code}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground",
                    option.code === code && "bg-accent/50",
                  )}
                  onClick={() => {
                    onChange?.(option.code);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="w-8 shrink-0 font-mono font-semibold">{option.code}</span>
                  <span className="min-w-0 truncate text-muted-foreground">{option.name ?? option.symbol ?? ""}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CurrencyAmountInput({
  value,
  placeholder,
  currencyCode,
  currencyOptions,
  currencyEditable,
  disabled,
  ariaLabel,
  onCurrencyChange,
  onChange,
  onBlur,
}: {
  value: string;
  placeholder: string;
  currencyCode: string;
  currencyOptions: CurrencyOption[];
  currencyEditable?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  onCurrencyChange?: (currencyCode: string) => void;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex h-7 w-full min-w-0 overflow-hidden rounded-md border border-input bg-card text-xs shadow-sm",
        "focus-within:ring-2 focus-within:ring-ring",
        disabled && "opacity-50",
      )}
    >
      <CurrencyLeadingControl
        currencyCode={currencyCode}
        options={currencyOptions}
        editable={currencyEditable}
        disabled={disabled}
        onChange={onCurrencyChange}
      />
      <input
        aria-label={ariaLabel}
        className="min-w-[10ch] flex-1 bg-transparent px-2 text-right tabular-nums outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(e.target.value)}
      />
    </div>
  );
}

const READONLY_PRIMARY_TEXT = "text-sm text-foreground";
const READONLY_SECONDARY_TEXT = "mt-0.5 text-xs text-muted-foreground";

function ReferenceSummaryCell({
  line,
  field,
}: {
  line: DocumentLine;
  field?: EntityField | null;
}) {
  const display = referenceSummaryFromLine(line, field);
  if (!display.primary) {
    return <span className="text-sm text-muted-foreground/30 italic">-</span>;
  }

  return (
    <div className="min-w-0" title={display.title}>
      <div className={cn(READONLY_PRIMARY_TEXT, "truncate")}>{display.primary}</div>
      {display.secondary && (
        <div className={cn(READONLY_SECONDARY_TEXT, "truncate font-mono leading-tight")}>
          {display.secondary}
        </div>
      )}
    </div>
  );
}

function AmtCell({ value, side, minorUnits }: { value: unknown; side: "debit" | "credit"; minorUnits: number }) {
  const n = Number(value);
  if (!n) return <span className="text-sm tabular-nums text-muted-foreground/30">-</span>;
  return (
    <span className={cn("text-sm tabular-nums font-medium", side === "debit" ? "text-foreground" : "text-foreground")}>
      {fmtAmt(n, minorUnits)}
    </span>
  );
}

function SubledgerBadge({ type }: { type: string | null | undefined }) {
  if (!type) return <span className="text-muted-foreground/30 text-xs">-</span>;
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-doc-support font-mono uppercase tracking-wide text-muted-foreground">
      {type}
    </span>
  );
}

const LINE_EDITOR_COLUMNS =
  "2rem minmax(0,1.25fr) minmax(0,1.65fr) minmax(5.5rem,0.4fr) minmax(9rem,.8fr) minmax(9rem,.8fr) 2.25rem";

const LINE_EDITOR_COLUMNS_WITH_REFERENCE =
  "2rem minmax(0,1.1fr) minmax(0,1.4fr) minmax(0,1.15fr) minmax(5.5rem,0.4fr) minmax(9rem,.75fr) minmax(9rem,.75fr) 2.25rem";

const LINE_HEADER_CELL = "px-3 py-2.5 text-xs font-medium text-muted-foreground";
const LINE_BODY_CELL = "min-w-0 px-3 py-1.5";
const LINE_ROWS_SCROLL_AREA = "max-h-[28rem] overflow-y-auto";

type JournalIntakeLineColumnVisibility = {
  glAccount: boolean;
  description: boolean;
  subledger: boolean;
  debit: boolean;
  credit: boolean;
};

function normalizeIntakeFieldSet(fields?: readonly string[] | null): ReadonlySet<string> | null {
  if (!fields) return null;
  const normalized = fields
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean);
  return normalized.length > 0 ? new Set(normalized) : null;
}

function intakeFieldVisible(fieldSet: ReadonlySet<string> | null, ...fieldNames: Array<string | undefined | null>): boolean {
  if (!fieldSet) return true;
  return fieldNames.some((fieldName) => typeof fieldName === "string" && fieldSet.has(fieldName.trim().toLowerCase()));
}

function buildJournalIntakeLineColumns(visibility: JournalIntakeLineColumnVisibility): string {
  const columns = ["2rem"];
  if (visibility.glAccount) columns.push("minmax(0,1.25fr)");
  if (visibility.description) columns.push("minmax(0,1.65fr)");
  if (visibility.subledger) columns.push("minmax(5.5rem,0.4fr)");
  if (visibility.debit) columns.push("minmax(9rem,.8fr)");
  if (visibility.credit) columns.push("minmax(9rem,.8fr)");
  columns.push("2.25rem");
  return columns.join(" ");
}

export interface JournalIntakeLinesGridProps {
  value?: unknown;
  onChange: (lines: JournalLineGridPayload[]) => void;
  headerContext?: Record<string, unknown> | null;
  intakeFields?: readonly string[] | null;
  currencyCode?: string;
  baseCurrencyCode?: string;
  transactionCurrencyCode?: string;
  exchangeRate?: unknown;
  onExchangeRateChange?: (value: string) => void;
  onExchangeRateStatusChange?: (status: JournalExchangeRateStatus) => void;
  onTransactionCurrencyCodeChange?: (value: string) => void;
  currencySelectorEditable?: boolean;
  currencyMinorUnits?: number | null;
  lineEntityCode?: string;
  minRows?: number;
  error?: string | null;
}

export function JournalIntakeLinesGrid({
  value,
  onChange,
  headerContext,
  intakeFields,
  currencyCode = "USD",
  baseCurrencyCode,
  transactionCurrencyCode,
  exchangeRate,
  onExchangeRateChange,
  onExchangeRateStatusChange,
  onTransactionCurrencyCodeChange,
  currencySelectorEditable,
  currencyMinorUnits,
  lineEntityCode,
  minRows = 2,
  error,
}: JournalIntakeLinesGridProps) {
  const transactionCurrency = normalizeCurrencyCode(transactionCurrencyCode ?? currencyCode);
  const baseCurrency = normalizeCurrencyCode(baseCurrencyCode);
  const currencyOptions = useCurrencyOptions([transactionCurrency, currencyCode, baseCurrency]);
  const selectedCurrencyMinorUnits = currencyOptions.find((option) => option.code === transactionCurrency)?.minor_units;
  const amountScale = resolveCurrencyMinorUnits(
    selectedCurrencyMinorUnits ?? currencyMinorUnits,
    transactionCurrency || currencyCode,
  );
  const amountPlaceholder = (0).toFixed(amountScale);
  const journalLineEntity = useCompiledEntityMetadata(lineEntityCode ?? "");
  const journalLineFieldNames = useMemo(
    () => readJournalLineFieldNames(undefined, journalLineEntity),
    [journalLineEntity],
  );
  const glAccountField = useMemo(() => (
    fieldByName(journalLineEntity, journalLineFieldNames.accountField) ??
    journalLineEntity?.fields.find((f) => f.reference_config?.target_entity === "gl_account") ??
    null
  ), [journalLineEntity, journalLineFieldNames.accountField]);
  const debitField = useMemo(() => fieldByName(journalLineEntity, journalLineFieldNames.debitField), [journalLineEntity, journalLineFieldNames.debitField]);
  const creditField = useMemo(() => fieldByName(journalLineEntity, journalLineFieldNames.creditField), [journalLineEntity, journalLineFieldNames.creditField]);
  const intakeFieldSet = useMemo(() => normalizeIntakeFieldSet(intakeFields), [intakeFields]);
  const intakeColumnVisibility = useMemo<JournalIntakeLineColumnVisibility>(() => ({
    glAccount: intakeFieldVisible(
      intakeFieldSet,
      journalLineFieldNames.accountField,
      journalLineFieldNames.accountCodePayloadField,
      "gl_account_id",
      "gl_account_code",
      "account_id",
      "account_code",
    ),
    description: intakeFieldVisible(
      intakeFieldSet,
      journalLineFieldNames.descriptionPayloadField,
      "description",
      "line_description",
      "item_description",
    ),
    subledger: intakeFieldVisible(intakeFieldSet, "subledger_type"),
    debit: intakeFieldVisible(
      intakeFieldSet,
      journalLineFieldNames.debitField,
      journalLineFieldNames.debitPayloadField,
      "transaction_debit",
      "debit",
    ),
    credit: intakeFieldVisible(
      intakeFieldSet,
      journalLineFieldNames.creditField,
      journalLineFieldNames.creditPayloadField,
      "transaction_credit",
      "credit",
    ),
  }), [intakeFieldSet, journalLineFieldNames]);
  const intakeEditorColumns = useMemo(
    () => buildJournalIntakeLineColumns(intakeColumnVisibility),
    [intakeColumnVisibility],
  );
  const debitMoneyFormat = useMemo(
    () => resolveMoneyFieldFormat(debitField?.money_config, {
      header: headerContext,
      fallbackCurrencyCode: transactionCurrency || currencyCode,
    }),
    [debitField?.money_config, headerContext, transactionCurrency, currencyCode],
  );
  const creditMoneyFormat = useMemo(
    () => resolveMoneyFieldFormat(creditField?.money_config, {
      header: headerContext,
      fallbackCurrencyCode: transactionCurrency || currencyCode,
    }),
    [creditField?.money_config, headerContext, transactionCurrency, currencyCode],
  );
  const amountCurrencyEditable =
    debitMoneyFormat.currencyEditable ??
    creditMoneyFormat.currencyEditable ??
    currencySelectorEditable ??
    Boolean(onTransactionCurrencyCodeChange);
  const amountCurrencyPosition = debitMoneyFormat.currencyCodePosition ?? creditMoneyFormat.currencyCodePosition ?? "prefix";
  const amountUsesItemCurrency = moneyConfigUsesItemCurrency(debitField) || moneyConfigUsesItemCurrency(creditField);
  const [draftLines, setDraftLines] = useState<JournalLineDraft[]>(() =>
    normalizeDraftLines(value, minRows, amountScale, transactionCurrency || currencyCode, journalLineFieldNames),
  );
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const draftValidation = useMemo(
    () => validateDraftLines(draftLines, false, minRows, amountScale, journalLineFieldNames),
    [draftLines, minRows, amountScale, journalLineFieldNames],
  );

  useEffect(() => {
    onChangeRef.current(draftValidation.payload);
  }, [draftValidation]);

  function updateDraftLine(key: string, patch: Partial<JournalLineDraft>) {
    setDraftLines((prev) => prev.map((line) => line.key === key ? { ...line, ...patch } : line));
  }

  function addDraftLine() {
    setDraftLines((prev) => [...prev, newDraftLine(transactionCurrency || currencyCode)]);
  }

  function removeDraftLine(key: string) {
    setDraftLines((prev) => prev.length <= minRows ? prev : prev.filter((line) => line.key !== key));
  }

  function resetDraftLines() {
    setDraftLines(normalizeDraftLines(value, minRows, amountScale, transactionCurrency || currencyCode, journalLineFieldNames));
  }

  function changeTransactionCurrency(nextCurrencyCode: string) {
    const next = normalizeCurrencyCode(nextCurrencyCode);
    if (!next || next === transactionCurrency) return;
    onTransactionCurrencyCodeChange?.(next);
    onExchangeRateChange?.("");
  }

  function changeLineCurrency(key: string, nextCurrencyCode: string) {
    const next = normalizeCurrencyCode(nextCurrencyCode);
    if (!next) return;
    if (amountUsesItemCurrency) {
      updateDraftLine(key, { transaction_currency: next });
      return;
    }
    changeTransactionCurrency(next);
  }

  const totalDebit = draftValidation.totalDebit;
  const totalCredit = draftValidation.totalCredit;
  const activeDraftLineCount = draftLines.filter((line) => !isBlankDraft(line)).length;
  const requiresExchangeRate = Boolean(transactionCurrency && baseCurrency && transactionCurrency !== baseCurrency);
  const exchangeRateValue = exchangeRate == null ? "" : String(exchangeRate);
  const postingDate = postingDateFromContext(headerContext);
  const exchangeRateStatus = useExchangeRateDefault({
    requiresExchangeRate,
    transactionCurrency,
    baseCurrency,
    postingDate,
    exchangeRateValue,
    onExchangeRateChange,
    onStatusChange: onExchangeRateStatusChange,
  });
  const validationMessage = error ?? exchangeRateStatus.message ?? draftValidation.message;
  const validationIsError = Boolean(error || (exchangeRateStatus.blocking && !exchangeRateStatus.loading));

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-muted/40 border-b border-border/40">
        <span className="text-xs font-semibold text-foreground">
          {activeDraftLineCount} {journalLineEntity?.entity_name ?? "Journal Line"}{activeDraftLineCount !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={addDraftLine}>
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={resetDraftLines}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>

      {requiresExchangeRate && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-muted/20 px-3.5 py-2">
          <div className="min-w-0">
            <div className="text-xs font-medium text-foreground">Exchange Rate</div>
            <div className="text-doc-subtitle text-muted-foreground">{transactionCurrency} to {baseCurrency}</div>
          </div>
          <Input
            className="h-8 w-full max-w-60 flex-1 text-right text-xs tabular-nums sm:flex-none"
            inputMode="decimal"
            value={exchangeRateValue}
            placeholder={exchangeRateStatus.loading ? "Resolving..." : "Latest default"}
            onChange={(e) => onExchangeRateChange?.(e.target.value)}
          />
        </div>
      )}

      {validationMessage && (
        <div className={cn(
          "flex items-center gap-2 border-b px-3.5 py-2 text-xs",
          validationIsError
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-warning/30 bg-warning/10 text-warning",
        )}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{validationMessage}</span>
        </div>
      )}

      <div className="overflow-hidden">
        <div
          className="grid items-center border-b bg-muted/50 text-sm"
          style={{ gridTemplateColumns: intakeEditorColumns }}
        >
          <div className={cn(LINE_HEADER_CELL, "text-center")}>#</div>
          {intakeColumnVisibility.glAccount && (
            <div className={cn(LINE_HEADER_CELL, "text-left")}>GL Account</div>
          )}
          {intakeColumnVisibility.description && (
            <div className={cn(LINE_HEADER_CELL, "text-left")}>Description</div>
          )}
          {intakeColumnVisibility.subledger && (
            <div className={cn(LINE_HEADER_CELL, "text-center")}>Subledger</div>
          )}
          {intakeColumnVisibility.debit && (
            <div className={cn(LINE_HEADER_CELL, "text-right")}>Debit</div>
          )}
          {intakeColumnVisibility.credit && (
            <div className={cn(LINE_HEADER_CELL, "text-right")}>Credit</div>
          )}
          <div className="px-2 py-2" />
        </div>

        <div className={cn(LINE_ROWS_SCROLL_AREA, "divide-y divide-border/40")} style={{ scrollbarGutter: "stable" }}>
          {draftLines.map((line, index) => {
            const lineContext = {
              ...line,
              transaction_currency: line.transaction_currency || transactionCurrency || currencyCode,
            };
            const debitCurrencyCode = resolveLineCurrencyCode(
              debitField,
              headerContext,
              lineContext,
              transactionCurrency || currencyCode,
            );
            const creditCurrencyCode = resolveLineCurrencyCode(
              creditField,
              headerContext,
              lineContext,
              debitCurrencyCode,
            );

            return (
            <div
              key={line.key}
              className="grid items-center bg-card text-sm"
              style={{ gridTemplateColumns: intakeEditorColumns }}
            >
              <div className="px-3 py-2 text-center text-sm text-muted-foreground tabular-nums">{index + 1}</div>
              {intakeColumnVisibility.glAccount && (
                <div className={LINE_BODY_CELL}>
                  <GlAccountPicker
                    value={line.gl_account_code || null}
                    displayLabel={line.gl_account_label || line.gl_account_code || null}
                    field={glAccountField}
                    formData={headerContext}
                    onChange={(code, label) => updateDraftLine(line.key, {
                      gl_account_code:  code ?? "",
                      gl_account_label: code ? (label ?? code) : "",
                    })}
                    className="w-full min-w-0"
                  />
                </div>
              )}
              {intakeColumnVisibility.description && (
                <div className={LINE_BODY_CELL}>
                  <Input
                    className="h-8 w-full min-w-0 text-sm"
                    value={line.description}
                    onChange={(e) => updateDraftLine(line.key, { description: e.target.value })}
                  />
                </div>
              )}
              {intakeColumnVisibility.subledger && (
                <div className="px-3 py-1.5 flex items-center justify-center">
                  <SubledgerBadge type={line.subledger_type} />
                </div>
              )}
              {intakeColumnVisibility.debit && (
                <div className={LINE_BODY_CELL}>
                  <CurrencyAmountInput
                    ariaLabel={`Debit amount for line ${index + 1}`}
                    currencyCode={debitCurrencyCode}
                    currencyOptions={currencyOptions}
                    currencyEditable={amountCurrencyEditable}
                    value={line.debit}
                    placeholder={amountPlaceholder}
                    onCurrencyChange={(next) => changeLineCurrency(line.key, next)}
                    onChange={(nextValue) => updateDraftLine(line.key, { debit: nextValue, credit: nextValue.trim() ? "" : line.credit })}
                    onBlur={(nextValue) => updateDraftLine(line.key, { debit: fmtInputAmount(nextValue, amountScale) })}
                  />
                </div>
              )}
              {intakeColumnVisibility.credit && (
                <div className={LINE_BODY_CELL}>
                  <CurrencyAmountInput
                    ariaLabel={`Credit amount for line ${index + 1}`}
                    currencyCode={creditCurrencyCode}
                    currencyOptions={currencyOptions}
                    currencyEditable={amountCurrencyEditable}
                    value={line.credit}
                    placeholder={amountPlaceholder}
                    onCurrencyChange={(next) => changeLineCurrency(line.key, next)}
                    onChange={(nextValue) => updateDraftLine(line.key, { credit: nextValue, debit: nextValue.trim() ? "" : line.debit })}
                    onBlur={(nextValue) => updateDraftLine(line.key, { credit: fmtInputAmount(nextValue, amountScale) })}
                  />
                </div>
              )}
              <div className="px-1 py-1.5 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeDraftLine(line.key)}
                  disabled={draftLines.length <= minRows}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between items-center px-4 py-3 border-t border-border/40 bg-muted/20 text-xs flex-wrap gap-3">
        <div className="flex gap-6">
          <span>
            <span className="text-muted-foreground mr-1.5">Total Debit</span>
            <span className="font-semibold tabular-nums">{fmtDisplayMoney(totalDebit, transactionCurrency || currencyCode, amountScale, amountCurrencyPosition)}</span>
          </span>
          <span>
            <span className="text-muted-foreground mr-1.5">Total Credit</span>
            <span className="font-semibold tabular-nums">{fmtDisplayMoney(totalCredit, transactionCurrency || currencyCode, amountScale, amountCurrencyPosition)}</span>
          </span>
        </div>
        <span className={cn(
          "text-xs font-medium",
          draftValidation.ok ? "text-success" : "text-destructive",
        )}>
          {activeDraftLineCount === 0 ? "No lines" : draftValidation.ok ? "Balanced" : `Imbalance: ${fmtDisplayMoney(Math.abs(totalDebit - totalCredit), transactionCurrency || currencyCode, amountScale, amountCurrencyPosition)}`}
        </span>
      </div>
    </div>
  );
}

export interface JournalLinesGridProps {
  entity?: CompiledEntity;
  lines:     DocumentLine[];
  isLoading?: boolean;
  currencyCode?: string;
  currencyMinorUnits?: number | null;
  recordId?: string;
  recordUuid?: string;
  record?: Record<string, unknown>;
  editMode?: boolean;
  onRefresh?: () => void;
}

export function JournalLinesGrid({
  entity,
  lines,
  isLoading,
  currencyCode = "USD",
  currencyMinorUnits,
  recordId,
  recordUuid,
  record,
  editMode,
  onRefresh,
}: JournalLinesGridProps) {
  const recordCurrencyCode = normalizeCurrencyCode(currencyCode) || "USD";
  const [draftCurrencyCode, setDraftCurrencyCode] = useState(recordCurrencyCode);
  const activeCurrencyCode = editMode ? (draftCurrencyCode || recordCurrencyCode) : recordCurrencyCode;
  const currencyOptions = useCurrencyOptions([
    activeCurrencyCode,
    recordCurrencyCode,
    normalizeCurrencyCode(record?.["base_currency"]),
    normalizeCurrencyCode(record?.["base_currency_code"]),
  ]);
  const selectedCurrencyMinorUnits = currencyOptions.find((option) => option.code === activeCurrencyCode)?.minor_units;
  const amountScale = resolveCurrencyMinorUnits(selectedCurrencyMinorUnits ?? currencyMinorUnits, activeCurrencyCode);
  const amountPlaceholder = (0).toFixed(amountScale);
  const journalLineEntityCode = useMemo(() => readJournalLineEntityCode(entity), [entity]);
  const journalLineEntity = useCompiledEntityMetadata(journalLineEntityCode);
  const journalLineFieldNames = useMemo(
    () => readJournalLineFieldNames(entity, journalLineEntity),
    [entity, journalLineEntity],
  );
  const glAccountField = useMemo(() => (
    fieldByName(journalLineEntity, journalLineFieldNames.accountField) ??
    journalLineEntity?.fields.find((f) => f.reference_config?.target_entity === "gl_account") ??
    null
  ), [journalLineEntity, journalLineFieldNames.accountField]);
  const debitField = useMemo(() => fieldByName(journalLineEntity, journalLineFieldNames.debitField), [journalLineEntity, journalLineFieldNames.debitField]);
  const creditField = useMemo(() => fieldByName(journalLineEntity, journalLineFieldNames.creditField), [journalLineEntity, journalLineFieldNames.creditField]);
  const debitMoneyFormat = useMemo(
    () => resolveMoneyFieldFormat(debitField?.money_config, {
      header: record,
      fallbackCurrencyCode: activeCurrencyCode,
    }),
    [debitField?.money_config, record, activeCurrencyCode],
  );
  const creditMoneyFormat = useMemo(
    () => resolveMoneyFieldFormat(creditField?.money_config, {
      header: record,
      fallbackCurrencyCode: activeCurrencyCode,
    }),
    [creditField?.money_config, record, activeCurrencyCode],
  );
  const amountCurrencyEditable = debitMoneyFormat.currencyEditable ?? creditMoneyFormat.currencyEditable ?? true;
  const amountCurrencyPosition = debitMoneyFormat.currencyCodePosition ?? creditMoneyFormat.currencyCodePosition ?? "prefix";
  const amountUsesItemCurrency = moneyConfigUsesItemCurrency(debitField) || moneyConfigUsesItemCurrency(creditField);
  const showLineReferences = useMemo(() => lineReferencesEnabled(entity), [entity]);
  const referenceTargets = useMemo(
    () => showLineReferences ? readReferenceTargets(entity) : [],
    [entity, showLineReferences],
  );
  const [draftLines, setDraftLines] = useState<JournalLineDraft[]>(() =>
    lines.length > 0
      ? lines.map((line) => lineToDraft(line, referenceTargets, amountScale, journalLineFieldNames, glAccountField))
      : [newDraftLine(activeCurrencyCode), newDraftLine(activeCurrencyCode)],
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const currencyContext = useMemo(
    () => journalCurrencyContext(record, lines, activeCurrencyCode, activeCurrencyCode),
    [record, lines, activeCurrencyCode],
  );
  const initialExchangeRate = useMemo(
    () => fmtExchangeRateInput(record?.["exchange_rate"] ?? exchangeRateFromLines(lines)),
    [record, lines],
  );
  const [exchangeRateInput, setExchangeRateInput] = useState(initialExchangeRate);

  useEffect(() => {
    setDraftLines(lines.length > 0
      ? lines.map((line) => lineToDraft(line, referenceTargets, amountScale, journalLineFieldNames, glAccountField))
      : [newDraftLine(activeCurrencyCode), newDraftLine(activeCurrencyCode)]);
    setSaveError(null);
  // Rehydrate when persisted lines or async line metadata changes, while keeping
  // unsaved amount edits intact when only the selected currency scale changes.
  // Server/refreshed lines still reset the draft from persisted data.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, referenceTargets, journalLineFieldNames, glAccountField]);

  useEffect(() => {
    setDraftCurrencyCode(recordCurrencyCode);
  }, [recordCurrencyCode]);

  useEffect(() => {
    setExchangeRateInput(initialExchangeRate);
  }, [initialExchangeRate]);

  const draftValidation = useMemo(
    () => validateDraftLines(draftLines, showLineReferences, 2, amountScale, journalLineFieldNames),
    [draftLines, showLineReferences, amountScale, journalLineFieldNames],
  );
  const exchangeRateNumber = Number(exchangeRateInput);
  const hasExchangeRateInput = exchangeRateInput.trim().length > 0;
  const exchangeRateStatus = useExchangeRateDefault({
    requiresExchangeRate: currencyContext.requiresExchangeRate,
    transactionCurrency:  currencyContext.transactionCurrency,
    baseCurrency:         currencyContext.baseCurrency,
    postingDate:          postingDateFromContext(record),
    exchangeRateValue:    exchangeRateInput,
    onExchangeRateChange: (value) => {
      setExchangeRateInput(value);
      setSaveError(null);
    },
  });
  const exchangeRateValidationMessage = exchangeRateStatus.message;

  const [readOnlySearch, setReadOnlySearch] = useState("");
  const filteredLines = useMemo(() => {
    if (!readOnlySearch.trim()) return lines;
    const q = readOnlySearch.trim().toLowerCase();
    return lines.filter((l) => {
      const d = (l.data ?? {}) as Record<string, unknown>;
      return (
        String(l.description ?? "").toLowerCase().includes(q) ||
        String(d["gl_account_code"] ?? d["account_code"] ?? "").toLowerCase().includes(q) ||
        (journalLineFieldNames.accountField ? String(d[journalLineFieldNames.accountField] ?? "").toLowerCase().includes(q) : false)
      );
    });
  }, [lines, readOnlySearch, journalLineFieldNames.accountField]);

  function updateDraftLine(key: string, patch: Partial<JournalLineDraft>) {
    setDraftLines((prev) => prev.map((line) => line.key === key ? { ...line, ...patch } : line));
    setSaveError(null);
  }

  function addDraftLine() {
    setDraftLines((prev) => [...prev, newDraftLine(activeCurrencyCode)]);
    setSaveError(null);
  }

  function removeDraftLine(key: string) {
    setDraftLines((prev) => prev.length <= 2 ? prev : prev.filter((line) => line.key !== key));
    setSaveError(null);
  }

  function resetDraftLines() {
    setDraftLines(lines.length > 0
      ? lines.map((line) => lineToDraft(line, referenceTargets, amountScale, journalLineFieldNames, glAccountField))
      : [newDraftLine(activeCurrencyCode), newDraftLine(activeCurrencyCode)]);
    setDraftCurrencyCode(recordCurrencyCode);
    setSaveError(null);
  }

  function changeDraftCurrency(nextCurrencyCode: string) {
    const next = normalizeCurrencyCode(nextCurrencyCode);
    if (!next || next === activeCurrencyCode) return;
    setDraftCurrencyCode(next);
    setExchangeRateInput("");
    setSaveError(null);
  }

  function changeDraftLineCurrency(key: string, nextCurrencyCode: string) {
    const next = normalizeCurrencyCode(nextCurrencyCode);
    if (!next) return;
    if (amountUsesItemCurrency) {
      updateDraftLine(key, { transaction_currency: next });
      return;
    }
    changeDraftCurrency(next);
  }

  async function saveDraftLines() {
    if (!draftValidation.ok) {
      setSaveError(draftValidation.message ?? "Journal lines are invalid.");
      return;
    }

    if (exchangeRateStatus.blocking) {
      setSaveError(exchangeRateValidationMessage ?? "Exchange Rate is required when currencies differ.");
      return;
    }

    const journalId = recordUuid ?? recordId;
    if (!journalId) {
      setSaveError("Journal record id is missing.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, unknown> = {
        lines:         draftValidation.payload,
        currency_code: activeCurrencyCode,
      };
      if (currencyContext.requiresExchangeRate && hasExchangeRateInput) body["exchange_rate"] = exchangeRateNumber;

      const res = await relayMutate(`/api/finance/journals/${encodeURIComponent(journalId)}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
        setSaveError(String(payload["message"] ?? payload["error"] ?? `Save failed (${res.status})`));
        return;
      }
      onRefresh?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  if (editMode) {
    const totalDebit = draftValidation.totalDebit;
    const totalCredit = draftValidation.totalCredit;
    const activeDraftLineCount = draftLines.filter((line) => !isBlankDraft(line)).length;
    const editorColumns = showLineReferences ? LINE_EDITOR_COLUMNS_WITH_REFERENCE : LINE_EDITOR_COLUMNS;
    const editLineEntityName = journalLineEntity?.entity_name ?? "Journal Line";

    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-muted/40 border-b border-border/40">
          <span className="text-xs font-semibold text-foreground">
            {activeDraftLineCount} {editLineEntityName}{activeDraftLineCount !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={addDraftLine}>
              <Plus className="h-3.5 w-3.5" />
              Add line
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={resetDraftLines} disabled={saving}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </Button>
            <Button size="sm" className="h-7 gap-1.5 text-xs" onClick={() => { void saveDraftLines(); }} disabled={saving || !draftValidation.ok || exchangeRateStatus.blocking}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save lines"}
            </Button>
          </div>
        </div>

        {currencyContext.requiresExchangeRate && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 bg-muted/20 px-3.5 py-2">
            <div className="min-w-0">
              <div className="text-xs font-medium text-foreground">Exchange Rate</div>
              <div className="text-doc-subtitle text-muted-foreground">
                {currencyContext.transactionCurrency} to {currencyContext.baseCurrency}
              </div>
            </div>
            <Input
              className="h-8 w-full max-w-60 flex-1 text-right text-xs tabular-nums sm:flex-none"
              inputMode="decimal"
              value={exchangeRateInput}
              placeholder={exchangeRateStatus.loading ? "Resolving..." : "Latest default"}
              disabled={saving}
              onChange={(e) => {
                setExchangeRateInput(e.target.value);
                setSaveError(null);
              }}
            />
          </div>
        )}

        {(saveError || exchangeRateValidationMessage || draftValidation.message) && (
          <div className={cn(
            "flex items-center gap-2 border-b px-3.5 py-2 text-xs",
            saveError || (exchangeRateStatus.blocking && !exchangeRateStatus.loading)
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-warning/30 bg-warning/10 text-warning",
          )}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{saveError ?? exchangeRateValidationMessage ?? draftValidation.message}</span>
          </div>
        )}

        <div className="overflow-hidden">
          <div
            className="grid items-center border-b bg-muted/50 text-sm"
            style={{ gridTemplateColumns: editorColumns }}
          >
            <div className={cn(LINE_HEADER_CELL, "text-center")}>#</div>
            <div className={cn(LINE_HEADER_CELL, "text-left")}>GL Account</div>
            <div className={cn(LINE_HEADER_CELL, "text-left")}>Description</div>
            {showLineReferences && (
              <div className={cn(LINE_HEADER_CELL, "text-left")}>Reference</div>
            )}
            <div className={cn(LINE_HEADER_CELL, "text-center")}>Subledger</div>
            <div className={cn(LINE_HEADER_CELL, "text-right")}>Debit</div>
            <div className={cn(LINE_HEADER_CELL, "text-right")}>Credit</div>
            <div className="px-2 py-2" />
          </div>

          <div className={cn(LINE_ROWS_SCROLL_AREA, "divide-y divide-border/40")} style={{ scrollbarGutter: "stable" }}>
            {draftLines.map((line, index) => {
              const lineContext = {
                ...line,
                transaction_currency: line.transaction_currency || activeCurrencyCode,
              };
              const debitCurrencyCode = resolveLineCurrencyCode(debitField, record, lineContext, activeCurrencyCode);
              const creditCurrencyCode = resolveLineCurrencyCode(creditField, record, lineContext, debitCurrencyCode);

              return (
              <div
                key={line.key}
                className="grid items-center bg-card text-sm"
                style={{ gridTemplateColumns: editorColumns }}
              >
                <div className="px-3 py-2 text-center text-sm text-muted-foreground tabular-nums">{index + 1}</div>
                <div className={LINE_BODY_CELL}>
                  <GlAccountPicker
                    value={line.gl_account_code || null}
                    displayLabel={line.gl_account_label || line.gl_account_code || null}
                    field={glAccountField}
                    formData={record}
                    disabled={saving}
                    onChange={(code, label) => updateDraftLine(line.key, {
                      gl_account_code:  code ?? "",
                      gl_account_label: code ? (label ?? code) : "",
                    })}
                    className="w-full min-w-0"
                  />
                </div>
                <div className={LINE_BODY_CELL}>
                  <Input
                    className="h-8 w-full min-w-0 text-sm"
                    value={line.description}
                    onChange={(e) => updateDraftLine(line.key, { description: e.target.value })}
                  />
                </div>
                {showLineReferences && (
                  <div className={cn(LINE_BODY_CELL, "align-top")}>
                    <ReferencePicker
                      reference={line.reference}
                      targets={referenceTargets}
                      disabled={saving}
                      onChange={(reference) => updateDraftLine(line.key, { reference })}
                    />
                  </div>
                )}
                <div className="px-3 py-1.5 flex items-center justify-center">
                  <SubledgerBadge type={line.subledger_type} />
                </div>
                <div className={LINE_BODY_CELL}>
                  <CurrencyAmountInput
                    ariaLabel={`Debit amount for line ${index + 1}`}
                    currencyCode={debitCurrencyCode}
                    currencyOptions={currencyOptions}
                    currencyEditable={amountCurrencyEditable}
                    disabled={saving}
                    value={line.debit}
                    placeholder={amountPlaceholder}
                    onCurrencyChange={(next) => changeDraftLineCurrency(line.key, next)}
                    onChange={(nextValue) => updateDraftLine(line.key, { debit: nextValue, credit: nextValue.trim() ? "" : line.credit })}
                    onBlur={(nextValue) => updateDraftLine(line.key, { debit: fmtInputAmount(nextValue, amountScale) })}
                  />
                </div>
                <div className={LINE_BODY_CELL}>
                  <CurrencyAmountInput
                    ariaLabel={`Credit amount for line ${index + 1}`}
                    currencyCode={creditCurrencyCode}
                    currencyOptions={currencyOptions}
                    currencyEditable={amountCurrencyEditable}
                    disabled={saving}
                    value={line.credit}
                    placeholder={amountPlaceholder}
                    onCurrencyChange={(next) => changeDraftLineCurrency(line.key, next)}
                    onChange={(nextValue) => updateDraftLine(line.key, { credit: nextValue, debit: nextValue.trim() ? "" : line.debit })}
                    onBlur={(nextValue) => updateDraftLine(line.key, { credit: fmtInputAmount(nextValue, amountScale) })}
                  />
                </div>
                <div className="px-1 py-1.5 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeDraftLine(line.key)}
                    disabled={draftLines.length <= 2 || saving}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-between items-center px-4 py-3 border-t border-border/40 bg-muted/20 text-xs flex-wrap gap-3">
          <div className="flex gap-6">
            <span>
              <span className="text-muted-foreground mr-1.5">Total Debit</span>
              <span className="font-semibold tabular-nums">{fmtDisplayMoney(totalDebit, activeCurrencyCode, amountScale, amountCurrencyPosition)}</span>
            </span>
            <span>
              <span className="text-muted-foreground mr-1.5">Total Credit</span>
              <span className="font-semibold tabular-nums">{fmtDisplayMoney(totalCredit, activeCurrencyCode, amountScale, amountCurrencyPosition)}</span>
            </span>
          </div>
          <span className={cn(
            "text-xs font-medium",
            draftValidation.ok ? "text-success" : "text-destructive",
          )}>
            {activeDraftLineCount === 0 ? "No lines" : draftValidation.ok ? "Balanced" : `Imbalance: ${fmtDisplayMoney(Math.abs(totalDebit - totalCredit), activeCurrencyCode, amountScale, amountCurrencyPosition)}`}
          </span>
        </div>
      </div>
    );
  }

  const totalDebit  = lines.reduce((s, l) => s + (Number(journalLineFieldNames.debitField ? l.data?.[journalLineFieldNames.debitField] : 0)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(journalLineFieldNames.creditField ? l.data?.[journalLineFieldNames.creditField] : 0) || 0), 0);
  const hasReadOnlyLines = lines.length > 0;
  const readOnlyBalanced = hasReadOnlyLines && totalDebit > 0 && Math.abs(totalDebit - totalCredit) < 0.001;
  const lineEntityName = journalLineEntity?.entity_name ?? "Journal Line";

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-muted/40 border-b border-border/40">
        <span className="text-xs font-semibold text-foreground">
          {lines.length} {lineEntityName}{lines.length !== 1 ? "s" : ""}
        </span>
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={readOnlySearch}
            onChange={(e) => setReadOnlySearch(e.target.value)}
            placeholder="Search"
            className="h-7 w-44 rounded-md border border-border/60 bg-background pl-7 pr-7 text-xs outline-none transition-colors placeholder:text-muted-foreground/45 focus:border-ring/50 focus:ring-1 focus:ring-ring/30"
          />
          {readOnlySearch && (
            <button type="button" onClick={() => setReadOnlySearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground" aria-label="Clear search">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
      </div>

      {/* Table */}
      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 36  }} />
            <col style={{ width: 240 }} />
            <col />
            {showLineReferences && <col style={{ width: 210 }} />}
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b bg-muted">
            <tr>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-center">#</th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-left">GL Account</th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-left">Description</th>
              {showLineReferences && (
                <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-left">Reference</th>
              )}
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-center">Subledger</th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">Debit</th>
              <th className="px-3 py-2.5 text-xs font-medium text-muted-foreground text-right">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {filteredLines.length === 0 ? (
              <tr>
                <td colSpan={showLineReferences ? 7 : 6}>
                  <div className="flex flex-col items-center gap-2 py-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      {readOnlySearch ? "No lines match your search" : "No journal lines"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredLines.map((line) => {
                const d = line.data as Record<string, unknown> | null | undefined ?? {};
                return (
                  <tr key={line.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 text-center text-sm text-muted-foreground tabular-nums">
                      {line.line_number}
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <ReferenceSummaryCell line={line} field={glAccountField} />
                    </td>
                    <td className="px-3 py-2.5 min-w-0">
                      <div className={cn(READONLY_PRIMARY_TEXT, "truncate")}>{line.description || "-"}</div>
                    </td>
                    {showLineReferences && (
                      <td className="px-3 py-2.5 min-w-0">
                        <ReferenceBadge references={d["references"]} />
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-center">
                      <SubledgerBadge type={d["subledger_type"] as string | null | undefined} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <AmtCell value={journalLineFieldNames.debitField ? d[journalLineFieldNames.debitField] : undefined} side="debit" minorUnits={amountScale} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <AmtCell value={journalLineFieldNames.creditField ? d[journalLineFieldNames.creditField] : undefined} side="credit" minorUnits={amountScale} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Financial footer */}
      <div className="flex justify-between items-center px-4 py-3 border-t border-border/40 bg-muted/20 text-xs flex-wrap gap-3">
        <div className="flex gap-6">
            <span>
              <span className="text-muted-foreground mr-1.5">Total Debit</span>
              <span className="font-semibold tabular-nums">{fmtDisplayMoney(totalDebit, activeCurrencyCode, amountScale, amountCurrencyPosition)}</span>
            </span>
            <span>
              <span className="text-muted-foreground mr-1.5">Total Credit</span>
              <span className="font-semibold tabular-nums">{fmtDisplayMoney(totalCredit, activeCurrencyCode, amountScale, amountCurrencyPosition)}</span>
            </span>
        </div>
        <span className={cn(
          "text-xs font-medium",
          readOnlyBalanced ? "text-success" : hasReadOnlyLines ? "text-destructive" : "text-muted-foreground",
        )}>
          {!hasReadOnlyLines ? "No lines" : readOnlyBalanced ? "Balanced" : `Imbalance: ${fmtDisplayMoney(Math.abs(totalDebit - totalCredit), activeCurrencyCode, amountScale, amountCurrencyPosition)}`}
        </span>
      </div>
    </div>
  );
}
