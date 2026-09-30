import { PassThrough } from "node:stream";
import ExcelJS from "exceljs";

const XLSX_CONTENT_TYPE="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const;
const MAX_ARCHIVE_ENTRIES=2_000;
const MAX_UNCOMPRESSED_BYTES=256*1024*1024;
const MAX_COMPRESSION_RATIO=200;
const MAX_COLUMNS=500;

export interface WorkbookTemplateField { readonly key:string;readonly label:string;readonly required:boolean;readonly example?:string|number|boolean;readonly options?:readonly(string|number|boolean)[]; }

export class UnsafeWorkbookError extends Error {
  readonly code:string;
  constructor(code:string,message:string){super(message);this.name="UnsafeWorkbookError";this.code=code;}
}

export async function parseXlsxWorkbook(bytes:Uint8Array,options:{readonly maxRows:number;readonly allowedFields?:readonly string[]}):Promise<readonly Readonly<Record<string,unknown>>[]>{
  inspectXlsxContainer(bytes);
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  if(workbook.worksheets.length>50)throw new UnsafeWorkbookError("XLSX_TOO_MANY_WORKSHEETS","Excel workbooks may contain at most 50 worksheets.");
  const worksheet=workbook.getWorksheet("Data")??workbook.worksheets.find(sheet=>sheet.state==="visible")??workbook.worksheets[0];
  if(!worksheet)throw new UnsafeWorkbookError("XLSX_DATA_SHEET_REQUIRED","The workbook does not contain a Data worksheet.");
  const headers=readHeaders(worksheet);
  if(options.allowedFields){const allowed=new Set(options.allowedFields);for(const header of headers)if(!allowed.has(header))throw new UnsafeWorkbookError("XLSX_FIELD_NOT_ALLOWED",`Column '${header}' is not an importable field.`);}
  const rows:Readonly<Record<string,unknown>>[]=[];
  for(let rowNumber=2;rowNumber<=worksheet.actualRowCount;rowNumber+=1){
    const source=worksheet.getRow(rowNumber),result:Record<string,unknown>={};let populated=false;
    for(const [offset,header] of headers.entries()){
      const cell=source.getCell(offset+1);
      if(cell.isMerged)throw new UnsafeWorkbookError("XLSX_MERGED_DATA_CELL",`Merged cells are not allowed in Data row ${rowNumber}.`);
      const value=cellValue(cell,rowNumber,header);if(value!==undefined&&value!=="")populated=true;result[header]=value??"";
    }
    if(!populated)continue;rows.push(Object.freeze(result));
    if(rows.length>options.maxRows)throw new UnsafeWorkbookError("XLSX_ROW_LIMIT_EXCEEDED",`The workbook exceeds the ${options.maxRows} row limit.`);
  }
  return Object.freeze(rows);
}

export async function createXlsxTemplate(input:{readonly entityCode:string;readonly descriptorHash:string;readonly fields:readonly WorkbookTemplateField[]}):Promise<Uint8Array>{
  const workbook=new ExcelJS.Workbook();workbook.creator="Athyper";workbook.created=new Date();
  const instructions=workbook.addWorksheet("Instructions",{properties:{tabColor:{argb:"FF315C9A"}}});
  instructions.addRows([["Athyper governed import template"],["Entity",input.entityCode],["Descriptor",input.descriptorHash],["Instructions","Enter one record per row on the Data sheet. Do not rename required columns."]]);
  instructions.getColumn(1).width=24;instructions.getColumn(2).width=80;instructions.getRow(1).font={bold:true,size:16};
  const data=workbook.addWorksheet("Data",{views:[{state:"frozen",ySplit:1}]});
  data.addRow(input.fields.map(field=>field.key));data.addRow(input.fields.map(field=>field.example??""));
  data.getRow(1).font={bold:true,color:{argb:"FFFFFFFF"}};data.getRow(1).fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF315C9A"}};data.autoFilter={from:{row:1,column:1},to:{row:1,column:Math.max(1,input.fields.length)}};
  input.fields.forEach((field,index)=>{const column=data.getColumn(index+1);column.width=Math.min(48,Math.max(14,field.label.length+4));if(field.options?.length)for(let row=2;row<=Math.min(10_001,2_000);row+=1)data.getCell(row,index+1).dataValidation={type:"list",allowBlank:!field.required,formulae:[`"${field.options.map(String).join(",").replaceAll('"','""')}"`]};});
  const metadata=workbook.addWorksheet("Metadata",{state:"veryHidden"});metadata.addRows([["schemaVersion",1],["entityCode",input.entityCode],["descriptorHash",input.descriptorHash]]);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export function createXlsxExport(fields:readonly string[],rows:AsyncIterable<Readonly<Record<string,unknown>>>,options:{readonly information?:Readonly<Record<string,unknown>>}={}):AsyncIterable<Uint8Array>{
  const output=new PassThrough();
  const workbook=new ExcelJS.stream.xlsx.WorkbookWriter({stream:output,useStyles:true,useSharedStrings:false});
  if(options.information){const information=workbook.addWorksheet("Export information");for(const[key,value]of Object.entries(options.information))information.addRow([key,typeof value==="string"?value:JSON.stringify(value)]).commit();information.commit();}
  const worksheet=workbook.addWorksheet("Data",{views:[{state:"frozen",ySplit:1}]});
  worksheet.addRow(fields).commit();
  const produce=(async()=>{try{for await(const row of rows)worksheet.addRow(fields.map(field=>exportCell(row[field]))).commit();worksheet.commit();await workbook.commit();}catch(error){output.destroy(error instanceof Error?error:new Error("XLSX export failed"));}})();
  return(async function*(){for await(const chunk of output)yield new Uint8Array(chunk as Buffer);await produce;})();
}

export const xlsxArtifact={contentType:XLSX_CONTENT_TYPE,extension:"xlsx" as const};

function readHeaders(worksheet:ExcelJS.Worksheet):readonly string[]{const row=worksheet.getRow(1);if(row.cellCount===0)throw new UnsafeWorkbookError("XLSX_HEADER_REQUIRED","The Data worksheet requires a heading row.");if(row.cellCount>MAX_COLUMNS)throw new UnsafeWorkbookError("XLSX_COLUMN_LIMIT_EXCEEDED",`The Data worksheet may contain at most ${MAX_COLUMNS} columns.`);const headers=Array.from({length:row.cellCount},(_,index)=>{const cell=row.getCell(index+1);if(cell.isMerged)throw new UnsafeWorkbookError("XLSX_MERGED_HEADER","Merged heading cells are not allowed.");const value=cellValue(cell,1,`column_${index+1}`);if(typeof value!=="string"||!value.trim())throw new UnsafeWorkbookError("XLSX_HEADER_INVALID",`Column ${index+1} requires a text heading.`);return value.trim();});if(new Set(headers).size!==headers.length)throw new UnsafeWorkbookError("XLSX_HEADER_DUPLICATE","Excel headings must be unique.");return Object.freeze(headers);}
function cellValue(cell:ExcelJS.Cell,rowNumber:number,field:string):unknown{if(cell.type===ExcelJS.ValueType.Formula)throw new UnsafeWorkbookError("XLSX_FORMULA_NOT_ALLOWED",`Formula cells are not allowed at row ${rowNumber}, column '${field}'.`);const value=cell.value;if(value===null)return undefined;if(value instanceof Date)return value.toISOString();if(typeof value==="string"||typeof value==="number"||typeof value==="boolean")return value;if(value&&typeof value==="object"&&"richText"in value&&Array.isArray(value.richText))return value.richText.map(part=>part.text).join("");throw new UnsafeWorkbookError("XLSX_CELL_TYPE_UNSUPPORTED",`Unsupported Excel value at row ${rowNumber}, column '${field}'.`);}
function exportCell(value:unknown):string|number|boolean|Date|null{if(value===null||value===undefined)return null;if(value instanceof Date)return value;if(typeof value==="number"||typeof value==="boolean")return value;if(typeof value==="string")return /^[=+@-]/.test(value.trimStart())?`'${value}`:value;return JSON.stringify(value);}

export function inspectXlsxContainer(bytes:Uint8Array):void{
  const buffer=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(buffer.length<22||buffer.readUInt32LE(0)!==0x04034b50)throw new UnsafeWorkbookError("XLSX_SIGNATURE_INVALID","The uploaded file is not an XLSX ZIP container.");
  const minimum=Math.max(0,buffer.length-65_557);let eocd=-1;for(let offset=buffer.length-22;offset>=minimum;offset-=1)if(buffer.readUInt32LE(offset)===0x06054b50){eocd=offset;break;}if(eocd<0)throw new UnsafeWorkbookError("XLSX_ARCHIVE_INVALID","The XLSX central directory is missing.");
  const entries=buffer.readUInt16LE(eocd+10),centralSize=buffer.readUInt32LE(eocd+12),centralOffset=buffer.readUInt32LE(eocd+16);if(entries===0xffff||centralOffset===0xffffffff||centralSize===0xffffffff)throw new UnsafeWorkbookError("XLSX_ZIP64_UNSUPPORTED","ZIP64 workbooks are not accepted.");if(entries===0||entries>MAX_ARCHIVE_ENTRIES)throw new UnsafeWorkbookError("XLSX_ARCHIVE_ENTRY_LIMIT","The XLSX archive contains an unsafe number of entries.");if(centralOffset+centralSize>buffer.length)throw new UnsafeWorkbookError("XLSX_ARCHIVE_INVALID","The XLSX central directory is invalid.");
  let offset=centralOffset,totalCompressed=0,totalUncompressed=0,hasContentTypes=false,hasWorkbook=false;
  for(let index=0;index<entries;index+=1){if(offset+46>buffer.length||buffer.readUInt32LE(offset)!==0x02014b50)throw new UnsafeWorkbookError("XLSX_ARCHIVE_INVALID","The XLSX central directory entry is invalid.");const flags=buffer.readUInt16LE(offset+8),compressed=buffer.readUInt32LE(offset+20),uncompressed=buffer.readUInt32LE(offset+24),nameLength=buffer.readUInt16LE(offset+28),extraLength=buffer.readUInt16LE(offset+30),commentLength=buffer.readUInt16LE(offset+32),name=buffer.subarray(offset+46,offset+46+nameLength).toString("utf8");if(flags&1)throw new UnsafeWorkbookError("XLSX_ENCRYPTED","Password-protected or encrypted workbooks are not accepted.");if(name.includes("..")||name.startsWith("/")||name.includes("\\"))throw new UnsafeWorkbookError("XLSX_ARCHIVE_PATH_INVALID","The workbook contains an unsafe archive path.");if(/vbaProject\.bin$/i.test(name))throw new UnsafeWorkbookError("XLSX_MACRO_NOT_ALLOWED","Macro-enabled workbooks are not accepted.");if(/^xl\/externalLinks\//i.test(name))throw new UnsafeWorkbookError("XLSX_EXTERNAL_LINK_NOT_ALLOWED","External workbook links are not accepted.");hasContentTypes||=name==="[Content_Types].xml";hasWorkbook||=name==="xl/workbook.xml";totalCompressed+=compressed;totalUncompressed+=uncompressed;if(totalUncompressed>MAX_UNCOMPRESSED_BYTES)throw new UnsafeWorkbookError("XLSX_UNCOMPRESSED_LIMIT","The expanded workbook exceeds the safety limit.");offset+=46+nameLength+extraLength+commentLength;}
  if(!hasContentTypes||!hasWorkbook)throw new UnsafeWorkbookError("XLSX_STRUCTURE_INVALID","The ZIP container is not a valid Excel workbook.");if(totalCompressed>0&&totalUncompressed/totalCompressed>MAX_COMPRESSION_RATIO)throw new UnsafeWorkbookError("XLSX_COMPRESSION_RATIO","The workbook compression ratio exceeds the safety limit.");
}
