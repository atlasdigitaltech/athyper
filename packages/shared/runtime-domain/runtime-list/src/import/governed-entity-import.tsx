"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, CircleAlert, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button, Textarea } from "@athyper/platform-ui";

export interface GovernedImportColumn {
  key:string;
  label:string;
  required?:boolean;
}

export interface GovernedImportValidationRow {
  rowNumber:number;
  valid:boolean;
  errors:string[];
  warnings:string[];
  action?:"create"|"replace"|null;
  normalized:Record<string,unknown>;
}

export interface GovernedImportValidation {
  rows:GovernedImportValidationRow[];
  summary:{
    total:number;
    valid:number;
    invalid:number;
    warnings:number;
    creates?:number;
    replacements?:number;
  };
}

export interface GovernedImportResult {
  imported:number;
  created?:number;
  replaced?:number;
  rateIds?:string[];
}

export interface GovernedEntityImportProps {
  entityLabel:string;
  columns:GovernedImportColumn[];
  backHref:string;
  sampleText:string;
  validateRows:(rows:Record<string,unknown>[],mode:"create"|"replace_by_natural_key")=>Promise<GovernedImportValidation>;
  commitRows:(rows:Record<string,unknown>[],mode:"create"|"replace_by_natural_key")=>Promise<GovernedImportResult>;
}

export function GovernedEntityImport({
  entityLabel,
  columns,
  backHref,
  sampleText,
  validateRows,
  commitRows,
}:GovernedEntityImportProps) {
  const [sourceName,setSourceName]=useState("Pasted CSV");
  const [sourceRows,setSourceRows]=useState<string[][]>(()=>parseCsv(sampleText));
  const [paste,setPaste]=useState(sampleText);
  const [mapping,setMapping]=useState<Record<string,string>>(()=>defaultMapping(parseCsv(sampleText)[0]??[],columns));
  const [mode,setMode]=useState<"create"|"replace_by_natural_key">("replace_by_natural_key");
  const [validation,setValidation]=useState<GovernedImportValidation|null>(null);
  const [result,setResult]=useState<GovernedImportResult|null>(null);
  const [busy,setBusy]=useState<"parse"|"validate"|"commit"|null>(null);
  const [error,setError]=useState("");

  const headers=sourceRows[0]??[];
  const mappedRows=useMemo(
    ()=>sourceRows.slice(1).filter(row=>row.some(value=>value.trim())).map(row=>Object.fromEntries(
      columns.map(column=>{
        const source=mapping[column.key];
        const index=source?headers.indexOf(source):-1;
        return [column.key,index>=0?(row[index]??"").trim():""];
      }),
    )),
    [columns,headers.join("|"),mapping,sourceRows],
  );
  const requiredMapped=columns.filter(column=>column.required).every(column=>Boolean(mapping[column.key]));

  const applyPaste=()=>{
    const parsed=parseCsv(paste);
    setSourceName("Pasted CSV");
    setSourceRows(parsed);
    setMapping(defaultMapping(parsed[0]??[],columns));
    setValidation(null);
    setResult(null);
    setError(parsed.length<2?"Add a header and at least one data row.":"");
  };

  const loadFile=async(file:File)=>{
    setBusy("parse");
    setError("");
    try{
      const rows=/\.xlsx$/i.test(file.name)
        ? await parseXlsx(file)
        : parseCsv(await file.text());
      if(rows.length<2)throw new Error("The file must contain a header and at least one data row.");
      setSourceName(file.name);
      setSourceRows(rows);
      setMapping(defaultMapping(rows[0]??[],columns));
      setValidation(null);
      setResult(null);
    }catch(reason){
      setError(reason instanceof Error?reason.message:"The spreadsheet could not be read.");
    }finally{
      setBusy(null);
    }
  };

  const dryRun=async()=>{
    if(!requiredMapped||mappedRows.length===0)return;
    setBusy("validate");
    setError("");
    setResult(null);
    try{
      setValidation(await validateRows(mappedRows,mode));
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Server validation failed.");
    }finally{
      setBusy(null);
    }
  };

  const commit=async()=>{
    if(!validation||validation.summary.invalid>0)return;
    setBusy("commit");
    setError("");
    try{
      setResult(await commitRows(mappedRows,mode));
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Import failed.");
    }finally{
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <header className="rounded-xl border bg-card p-5">
        <Link href={backHref} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />Back to {entityLabel}
        </Link>
        <div className="mt-3 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-xl font-semibold">Import {entityLabel}</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">Upload CSV/XLSX or paste CSV, map columns, run the full server dry-run, then commit one atomic governed batch.</p>
      </header>

      <section className="rounded-xl border bg-card">
        <StepHeader number={1} title="Source" detail={sourceName}/>
        <div className="grid gap-4 p-5 lg:grid-cols-2">
          <div>
            <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center hover:bg-muted/20">
              <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
              <span className="mt-2 text-sm font-medium">{busy==="parse"?"Reading spreadsheet…":"Choose CSV or XLSX"}</span>
              <span className="mt-1 text-xs text-muted-foreground">Maximum 5,000 data rows per command</span>
              <input className="sr-only" type="file" accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>{
                const file=event.target.files?.[0];
                if(file)void loadFile(file);
              }}/>
            </label>
          </div>
          <div>
            <Textarea className="min-h-36 font-mono text-xs" value={paste} onChange={event=>setPaste(event.target.value)}/>
            <Button className="mt-2" type="button" variant="outline" onClick={applyPaste}>Use pasted CSV</Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <StepHeader number={2} title="Column mapping" detail={`${mappedRows.length} rows discovered`}/>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
          {columns.map(column=>(
            <label key={column.key} className="grid gap-1.5 text-sm font-medium">
              {column.label}{column.required?<span className="text-destructive"> Required</span>:null}
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={mapping[column.key]??""}
                onChange={event=>{
                  setMapping(current=>({...current,[column.key]:event.target.value}));
                  setValidation(null);
                  setResult(null);
                }}
              >
                <option value="">Not mapped</option>
                {headers.map(header=><option key={header} value={header}>{header}</option>)}
              </select>
            </label>
          ))}
        </div>
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
              <tr>{columns.map(column=><th key={column.key} className="px-3 py-2 font-medium">{column.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {mappedRows.slice(0,5).map((row,index)=>(
                <tr key={index}>{columns.map(column=><td key={column.key} className="max-w-48 truncate px-3 py-2">{String(row[column.key]??"")||"—"}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <StepHeader number={3} title="Server dry-run" detail="No records are written during validation"/>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <label className="grid gap-1.5 text-sm font-medium">
            Existing natural-key matches
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={mode} onChange={event=>{
              setMode(event.target.value as typeof mode);
              setValidation(null);
              setResult(null);
            }}>
              <option value="replace_by_natural_key">Create or replace with successor</option>
              <option value="create">Create only; reject duplicates</option>
            </select>
          </label>
          <Button disabled={!requiredMapped||mappedRows.length===0||mappedRows.length>5000||busy!=null} onClick={dryRun}>
            {busy==="validate"?"Validating…":"Validate all rows"}
          </Button>
        </div>
        {validation?<ValidationSummary validation={validation} onDownload={()=>downloadErrorRows(validation)}/>:null}
      </section>

      <section className="rounded-xl border bg-card">
        <StepHeader number={4} title="Commit and results" detail="Add and replacement rows use the same versioned domain command"/>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-muted-foreground">
            {result
              ? `${result.imported} rows committed · ${result.created??0} created · ${result.replaced??0} replaced`
              : "A successful dry-run is required before commit."}
          </p>
          <Button disabled={!validation||validation.summary.invalid>0||busy!=null||Boolean(result)} onClick={commit}>
            {busy==="commit"?"Committing…":"Commit governed import"}
          </Button>
        </div>
        {result?<div className="flex items-center gap-2 border-t bg-emerald-500/5 p-4 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden />Import completed successfully.</div>:null}
      </section>

      {error?<div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><CircleAlert className="h-4 w-4" aria-hidden />{error}</div>:null}
    </div>
  );
}

function StepHeader({number,title,detail}:{number:number;title:string;detail:string}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
      <h2 className="font-semibold"><span className="mr-2 text-muted-foreground">{number}.</span>{title}</h2>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </div>
  );
}

function ValidationSummary({validation,onDownload}:{validation:GovernedImportValidation;onDownload:()=>void}) {
  return (
    <div className="border-t p-5">
      <div className="grid gap-3 sm:grid-cols-5">
        <Summary label="Valid" value={validation.summary.valid}/>
        <Summary label="Invalid" value={validation.summary.invalid}/>
        <Summary label="Warnings" value={validation.summary.warnings}/>
        <Summary label="Creates" value={validation.summary.creates??0}/>
        <Summary label="Replacements" value={validation.summary.replacements??0}/>
      </div>
      <div className="mt-4 max-h-52 space-y-1 overflow-auto">
        {validation.rows.filter(row=>!row.valid||row.warnings.length).map(row=>(
          <p key={row.rowNumber} className="text-xs">
            <span className={row.valid?"text-amber-700":"text-destructive"}>Row {row.rowNumber}</span>
            {" · "}{[...row.errors,...row.warnings].join(" · ")}
          </p>
        ))}
      </div>
      {validation.summary.invalid?<Button className="mt-3" variant="outline" onClick={onDownload}><Download className="mr-2 h-4 w-4" aria-hidden />Download error rows</Button>:null}
    </div>
  );
}

function Summary({label,value}:{label:string;value:number}) {
  return <div className="rounded-lg border p-3"><p className="text-xl font-semibold tabular-nums">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}

function defaultMapping(headers:string[],columns:GovernedImportColumn[]):Record<string,string> {
  const normalized=new Map(headers.map(header=>[normalize(header),header]));
  return Object.fromEntries(columns.map(column=>[column.key,normalized.get(normalize(column.key))??normalized.get(normalize(column.label))??""]));
}

function normalize(value:string):string {
  return value.replace(/[^a-z0-9]/gi,"").toLowerCase();
}

function parseCsv(text:string):string[][] {
  const rows:string[][]=[];
  let row:string[]=[],cell="",quoted=false;
  for(let index=0;index<text.length;index+=1){
    const char=text[index]!;
    if(char==='"'&&quoted&&text[index+1]==='"'){cell+='"';index+=1;continue;}
    if(char==='"'){quoted=!quoted;continue;}
    if(char===","&&!quoted){row.push(cell);cell="";continue;}
    if((char==="\n"||char==="\r")&&!quoted){
      if(char==="\r"&&text[index+1]==="\n")index+=1;
      row.push(cell);rows.push(row);row=[];cell="";continue;
    }
    cell+=char;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows.filter(candidate=>candidate.some(value=>value.trim()));
}

async function parseXlsx(file:File):Promise<string[][]> {
  const excel=await import("exceljs");
  const workbook=new excel.Workbook();
  await workbook.xlsx.load(new Uint8Array(await file.arrayBuffer()) as never);
  const sheet=workbook.worksheets[0];
  if(!sheet)return [];
  const rows:string[][]=[];
  sheet.eachRow({includeEmpty:false},worksheetRow=>{
    const values=worksheetRow.values as unknown[];
    rows.push(values.slice(1).map(value=>xlsxValue(value)));
  });
  return rows;
}

function xlsxValue(value:unknown):string {
  if(value==null)return "";
  if(value instanceof Date)return value.toISOString().slice(0,10);
  if(typeof value==="object"&&"text" in value)return String((value as {text:unknown}).text??"");
  if(typeof value==="object"&&"result" in value)return String((value as {result:unknown}).result??"");
  return String(value);
}

function downloadErrorRows(validation:GovernedImportValidation) {
  const lines=["rowNumber,errors,warnings",...validation.rows.filter(row=>!row.valid).map(row=>[
    row.rowNumber,csvCell(row.errors.join(" | ")),csvCell(row.warnings.join(" | ")),
  ].join(","))];
  const url=URL.createObjectURL(new Blob([lines.join("\r\n")],{type:"text/csv;charset=utf-8"}));
  const anchor=document.createElement("a");
  anchor.href=url;
  anchor.download="import-errors.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value:string):string {
  return /[",\r\n]/.test(value)?`"${value.replaceAll('"','""')}"`:value;
}
