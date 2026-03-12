#!/usr/bin/env node
// framework/adapters/db/src/scripts/export-meta-tables.ts
//
// Export schema tables to Excel — either data dictionary (column definitions),
// row data, or both (default).
//
// Usage:
//   npx tsx src/scripts/export-meta-tables.ts                           # both, meta schema
//   npx tsx src/scripts/export-meta-tables.ts --mode dictionary         # column definitions only
//   npx tsx src/scripts/export-meta-tables.ts --mode data               # row data only
//   npx tsx src/scripts/export-meta-tables.ts --schema core --mode data # core schema data
//   npx tsx src/scripts/export-meta-tables.ts -o my-export.xlsx
//
// Environment:
//   DATABASE_ADMIN_URL or DATABASE_URL — Postgres connection string

import pg from "pg";
import ExcelJS from "exceljs";
import { parseArgs } from "node:util";
import { resolve } from "node:path";

const { Client } = pg;

/* ------------------------------------------------------------------ */
/*  CLI args                                                           */
/* ------------------------------------------------------------------ */
const { values: args } = parseArgs({
  options: {
    output: { type: "string", short: "o" },
    schema: { type: "string", short: "s", default: "meta" },
    mode: { type: "string", short: "m", default: "both" },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (args.help) {
  console.log(`
Usage: npx tsx src/scripts/export-meta-tables.ts [options]

Options:
  -o, --output <file>       Output filename (auto-generated if omitted)
  -s, --schema <name>       Schema to export (default: meta)
  -m, --mode <mode>         dictionary | data | both (default: both)
  -h, --help                Show this help
`);
  process.exit(0);
}

const SCHEMA = args.schema!;
const MODE = args.mode as "dictionary" | "data" | "both";

if (!["dictionary", "data", "both"].includes(MODE)) {
  console.error(`Invalid mode "${MODE}". Use: dictionary | data | both`);
  process.exit(1);
}

const OUTPUT = resolve(
  args.output ?? `${SCHEMA}-${MODE === "both" ? "tables" : MODE}-export.xlsx`,
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Truncate sheet name to 31 chars (Excel limit) and ensure uniqueness */
function sheetName(tableName: string, existing: Set<string>): string {
  let name = tableName.replace(`${SCHEMA}.`, "");
  if (name.length > 31) name = name.slice(0, 31);
  let candidate = name;
  let i = 2;
  while (existing.has(candidate)) {
    const suffix = `_${i}`;
    candidate = name.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  existing.add(candidate);
  return candidate;
}

type ColInfo = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

const BLUE = "FF2E86C1";
const GREEN = "FF27AE60";
const PURPLE = "FF8E44AD";
const WHITE = "FFFFFFFF";

function styleTocHeader(tocSheet: ExcelJS.Worksheet) {
  const headerRow = tocSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: WHITE }, size: 12 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: BLUE },
  };
  headerRow.alignment = { horizontal: "center" };
}

function addTocRow(
  tocSheet: ExcelJS.Worksheet,
  i: number,
  tableName: string,
  tabName: string,
  colCount: number,
  rowCount: number,
) {
  const tocRow = tocSheet.addRow({
    idx: i + 1,
    table: `${SCHEMA}.${tableName}`,
    cols: colCount,
    rows: rowCount,
  });
  const tableCell = tocRow.getCell(2);
  tableCell.value = {
    text: `${SCHEMA}.${tableName}`,
    hyperlink: `#'${tabName}'!A1`,
  };
  tableCell.font = { color: { argb: BLUE }, underline: true, size: 11 };
  if (i % 2 === 0) {
    for (let c = 1; c <= 4; c++) {
      tocRow.getCell(c).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD6EAF8" },
      };
    }
  }
}

function addBackToTocLink(ws: ExcelJS.Worksheet, col: string = "F1") {
  const cell = ws.getCell(col);
  cell.value = {
    text: "← Back to Table of Contents",
    hyperlink: "#'Table of Contents'!A1",
  };
  cell.font = { color: { argb: BLUE }, underline: true, size: 10 };
}

/* ------------------------------------------------------------------ */
/*  Build a Dictionary sheet                                           */
/* ------------------------------------------------------------------ */
function buildDictionarySheet(
  ws: ExcelJS.Worksheet,
  tableName: string,
  colInfo: ColInfo[],
  rowCount: number,
) {
  // Title
  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `${SCHEMA}.${tableName}`;
  titleCell.font = { bold: true, size: 14, color: { argb: BLUE } };

  ws.mergeCells("A2:D2");
  ws.getCell("A2").value = `${colInfo.length} columns · ${rowCount} rows`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF888888" } };

  // Header row
  const hdrRow = 4;
  const headers = ["Column Name", "Data Type", "Nullable", "Default"];
  const row = ws.getRow(hdrRow);
  headers.forEach((h, ci) => {
    const cell = row.getCell(ci + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PURPLE },
    };
    cell.alignment = { horizontal: "center" };
  });

  // Column data
  colInfo.forEach((col, ri) => {
    const r = ws.getRow(hdrRow + 1 + ri);
    r.getCell(1).value = col.column_name;
    r.getCell(2).value = col.data_type;
    r.getCell(3).value = col.is_nullable;
    r.getCell(4).value = col.column_default ?? "";
    if (ri % 2 === 0) {
      for (let c = 1; c <= 4; c++) {
        r.getCell(c).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF4ECF7" },
        };
      }
    }
  });

  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 30;

  // Auto-filter
  ws.autoFilter = {
    from: { row: hdrRow, column: 1 },
    to: { row: hdrRow + colInfo.length, column: 4 },
  };

  ws.views = [{ state: "frozen", ySplit: hdrRow, xSplit: 0 }];
  addBackToTocLink(ws);
}

/* ------------------------------------------------------------------ */
/*  Build a Data sheet                                                 */
/* ------------------------------------------------------------------ */
function buildDataSheet(
  ws: ExcelJS.Worksheet,
  tableName: string,
  colInfo: ColInfo[],
  data: Record<string, unknown>[],
) {
  // Title
  const colCount = colInfo.length;
  ws.mergeCells("A1:D1");
  const titleCell = ws.getCell("A1");
  titleCell.value = `${SCHEMA}.${tableName}`;
  titleCell.font = { bold: true, size: 14, color: { argb: GREEN } };

  ws.mergeCells("A2:D2");
  ws.getCell("A2").value = `${data.length} rows · ${colCount} columns`;
  ws.getCell("A2").font = { italic: true, color: { argb: "FF888888" } };

  const hdrRow = 4;

  if (colCount > 0) {
    // Header
    const row = ws.getRow(hdrRow);
    colInfo.forEach((col, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = col.column_name;
      cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: GREEN },
      };
      cell.alignment = { horizontal: "center" };
    });

    // Column widths
    colInfo.forEach((col, ci) => {
      ws.getColumn(ci + 1).width = Math.max(
        15,
        col.column_name.length + 4,
      );
    });

    // Data rows
    data.forEach((record, ri) => {
      const r = ws.getRow(hdrRow + 1 + ri);
      colInfo.forEach((col, ci) => {
        let val = record[col.column_name];
        if (val !== null && typeof val === "object") {
          val = JSON.stringify(val);
        }
        r.getCell(ci + 1).value = (val as ExcelJS.CellValue) ?? "";
        if (ri % 2 === 0) {
          r.getCell(ci + 1).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFEAFAF1" },
          };
        }
      });
    });

    // Auto-filter
    ws.autoFilter = {
      from: { row: hdrRow, column: 1 },
      to: { row: hdrRow + data.length, column: colCount },
    };
  }

  ws.views = [{ state: "frozen", ySplit: hdrRow, xSplit: 0 }];
  addBackToTocLink(ws);
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */
async function main() {
  const connStr =
    process.env.DATABASE_ADMIN_URL ||
    process.env.DATABASE_URL ||
    "postgresql://athyperadmin:athyperadmin@localhost:5432/athyper_dev1";

  const client = new Client({ connectionString: connStr });
  await client.connect();
  console.log(`Connected to database.`);

  // 1. Discover all tables
  const { rows: tables } = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    [SCHEMA],
  );

  if (tables.length === 0) {
    console.log(`No tables found in schema "${SCHEMA}".`);
    await client.end();
    return;
  }

  const modeLabel =
    MODE === "dictionary"
      ? "Data Dictionary"
      : MODE === "data"
        ? "Data"
        : "Dictionary + Data";
  console.log(
    `Found ${tables.length} tables in "${SCHEMA}" schema. Mode: ${modeLabel}`,
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Meta Studio Export";
  workbook.created = new Date();

  // TOC
  const tocSheet = workbook.addWorksheet("Table of Contents", {
    properties: { tabColor: { argb: BLUE } },
  });
  tocSheet.columns = [
    { header: "#", key: "idx", width: 5 },
    { header: "Table Name", key: "table", width: 40 },
    { header: "Columns", key: "cols", width: 12 },
    { header: "Rows", key: "rows", width: 12 },
  ];
  styleTocHeader(tocSheet);

  const sheetNames = new Set<string>();
  sheetNames.add("Table of Contents");

  // 2. Process each table
  for (let i = 0; i < tables.length; i++) {
    const tableName = tables[i].table_name;
    const fullName = `"${SCHEMA}"."${tableName}"`;
    const tabName = sheetName(tableName, sheetNames);

    // Always fetch column info
    const { rows: colInfo } = await client.query<ColInfo>(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position`,
      [SCHEMA, tableName],
    );

    // Fetch data only if needed
    let data: Record<string, unknown>[] = [];
    if (MODE === "data" || MODE === "both") {
      const result = await client.query(`SELECT * FROM ${fullName}`);
      data = result.rows;
    } else {
      // Just get count for TOC
      const result = await client.query<{ count: string }>(
        `SELECT count(*)::text as count FROM ${fullName}`,
      );
      data = []; // no data needed
      (data as any).__count = parseInt(result.rows[0].count, 10);
    }

    const rowCount =
      MODE === "dictionary"
        ? (data as any).__count ?? 0
        : data.length;

    console.log(
      `  [${i + 1}/${tables.length}] ${SCHEMA}.${tableName} — ${colInfo.length} cols, ${rowCount} rows`,
    );

    const tabColor = MODE === "dictionary" ? PURPLE : GREEN;
    const ws = workbook.addWorksheet(tabName, {
      properties: { tabColor: { argb: tabColor } },
    });

    if (MODE === "dictionary") {
      buildDictionarySheet(ws, tableName, colInfo, rowCount);
    } else if (MODE === "data") {
      buildDataSheet(ws, tableName, colInfo, data);
    } else {
      // "both" — dictionary first, then data below
      // Title
      ws.mergeCells("A1:D1");
      const titleCell = ws.getCell("A1");
      titleCell.value = `${SCHEMA}.${tableName}`;
      titleCell.font = { bold: true, size: 14, color: { argb: BLUE } };

      ws.mergeCells("A2:D2");
      ws.getCell("A2").value = `${data.length} rows · ${colInfo.length} columns`;
      ws.getCell("A2").font = { italic: true, color: { argb: "FF888888" } };

      // Dictionary section
      const dictHdr = 4;
      const dictHeaders = ["Column Name", "Data Type", "Nullable", "Default"];
      const dRow = ws.getRow(dictHdr);
      dictHeaders.forEach((h, ci) => {
        const cell = dRow.getCell(ci + 1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: PURPLE },
        };
        cell.alignment = { horizontal: "center" };
      });

      colInfo.forEach((col, ri) => {
        const r = ws.getRow(dictHdr + 1 + ri);
        r.getCell(1).value = col.column_name;
        r.getCell(2).value = col.data_type;
        r.getCell(3).value = col.is_nullable;
        r.getCell(4).value = col.column_default ?? "";
        if (ri % 2 === 0) {
          for (let c = 1; c <= 4; c++) {
            r.getCell(c).fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF4ECF7" },
            };
          }
        }
      });

      ws.getColumn(1).width = 30;
      ws.getColumn(2).width = 20;
      ws.getColumn(3).width = 10;
      ws.getColumn(4).width = 30;

      // Data section
      const dataStart = dictHdr + colInfo.length + 3;
      ws.mergeCells(`A${dataStart - 1}:D${dataStart - 1}`);
      const dataLabel = ws.getCell(`A${dataStart - 1}`);
      dataLabel.value = `Data (${data.length} rows)`;
      dataLabel.font = { bold: true, size: 12, color: { argb: GREEN } };

      if (colInfo.length > 0) {
        const dhRow = ws.getRow(dataStart);
        colInfo.forEach((col, ci) => {
          const cell = dhRow.getCell(ci + 1);
          cell.value = col.column_name;
          cell.font = { bold: true, color: { argb: WHITE }, size: 10 };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: GREEN },
          };
          cell.alignment = { horizontal: "center" };
        });

        for (let ci = 4; ci < colInfo.length; ci++) {
          ws.getColumn(ci + 1).width = Math.max(
            15,
            colInfo[ci].column_name.length + 4,
          );
        }

        data.forEach((record, ri) => {
          const r = ws.getRow(dataStart + 1 + ri);
          colInfo.forEach((col, ci) => {
            let val = record[col.column_name];
            if (val !== null && typeof val === "object") {
              val = JSON.stringify(val);
            }
            r.getCell(ci + 1).value = (val as ExcelJS.CellValue) ?? "";
            if (ri % 2 === 0) {
              r.getCell(ci + 1).fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FFEAFAF1" },
              };
            }
          });
        });

        ws.autoFilter = {
          from: { row: dataStart, column: 1 },
          to: { row: dataStart + data.length, column: colInfo.length },
        };
      }

      ws.views = [{ state: "frozen", ySplit: dataStart, xSplit: 0 }];
      addBackToTocLink(ws);
    }

    addTocRow(tocSheet, i, tableName, tabName, colInfo.length, rowCount);
  }

  // 3. Write
  await workbook.xlsx.writeFile(OUTPUT);
  console.log(`\nExported to: ${OUTPUT}`);

  await client.end();
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
