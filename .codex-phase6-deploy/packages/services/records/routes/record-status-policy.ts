export type RecordStatusSource = "purchase_invoice_parent" | "accounting_distribution_parent" | "record";

export function resolveRecordStatusSource(fullTable: string): RecordStatusSource {
  const tableName = fullTable.split(".").at(-1);
  if (tableName === "purchase_invoice_line") return "purchase_invoice_parent";
  if (tableName === "accounting_distribution") return "accounting_distribution_parent";
  return "record";
}
