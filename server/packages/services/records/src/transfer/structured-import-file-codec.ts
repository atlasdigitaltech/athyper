const MAX_COLUMNS=500;

export type StructuredImportFormat="csv"|"json"|"xlsx";

export class UnsafeStructuredImportError extends Error{
  readonly code:string;
  constructor(code:string,message:string){super(message);this.name="UnsafeStructuredImportError";this.code=code;}
}

export function structuredImportFormat(fileName:string):StructuredImportFormat{
  if(fileName.length>255||fileName.includes("/")||fileName.includes("\\"))throw new UnsafeStructuredImportError("IMPORT_FILE_NAME_INVALID","A safe CSV, XLSX, or JSON file name is required.");
  const extension=/\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if(extension!=="csv"&&extension!=="xlsx"&&extension!=="json")throw new UnsafeStructuredImportError("IMPORT_FILE_FORMAT_UNSUPPORTED","Only CSV, XLSX, and JSON import files are supported.");
  return extension;
}

export function structuredImportContentType(format:StructuredImportFormat):string{return format==="xlsx"?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":format==="csv"?"text/csv":"application/json";}

export function parseCsvImport(bytes:Uint8Array,options:{readonly maxRows:number;readonly allowedFields?:readonly string[]}):readonly Readonly<Record<string,unknown>>[]{
  const text=decodeUtf8(bytes,"CSV"),records=parseCsvRecords(text);
  if(!records.length)throw new UnsafeStructuredImportError("CSV_HEADER_REQUIRED","CSV requires a heading row.");
  const headers=records[0]!.map(value=>value.trim());validateHeaders(headers,options.allowedFields,"CSV");
  const rows:Readonly<Record<string,unknown>>[]=[];
  for(let index=1;index<records.length;index+=1){const source=records[index]!;if(source.length===1&&source[0]==="")continue;if(source.length!==headers.length)throw new UnsafeStructuredImportError("CSV_COLUMN_COUNT_INVALID",`CSV row ${index+1} has ${source.length} columns; ${headers.length} were expected.`);rows.push(Object.freeze(Object.fromEntries(headers.map((header,column)=>[header,source[column]??""]))));if(rows.length>options.maxRows)throw new UnsafeStructuredImportError("CSV_ROW_LIMIT_EXCEEDED",`The CSV file exceeds the ${options.maxRows} row limit.`);}
  return Object.freeze(rows);
}

export function parseJsonImport(bytes:Uint8Array,options:{readonly maxRows:number;readonly allowedFields?:readonly string[]}):readonly Readonly<Record<string,unknown>>[]{
  const text=decodeUtf8(bytes,"JSON");let value:unknown;try{value=JSON.parse(text);}catch{throw new UnsafeStructuredImportError("JSON_DOCUMENT_INVALID","The JSON import file is not valid JSON.");}
  const source=Array.isArray(value)?value:value&&typeof value==="object"&&!Array.isArray(value)&&Array.isArray((value as Record<string,unknown>)["rows"])?(value as Record<string,unknown>)["rows"]:undefined;
  if(!Array.isArray(source))throw new UnsafeStructuredImportError("JSON_ROWS_REQUIRED","JSON import requires an array of row objects or an object with a rows array.");
  if(source.length>options.maxRows)throw new UnsafeStructuredImportError("JSON_ROW_LIMIT_EXCEEDED",`The JSON file exceeds the ${options.maxRows} row limit.`);
  const allowed=options.allowedFields?new Set(options.allowedFields):undefined;
  return Object.freeze(source.map((item,index)=>{if(!item||typeof item!=="object"||Array.isArray(item))throw new UnsafeStructuredImportError("JSON_ROW_INVALID",`JSON row ${index+1} must be an object.`);const row=item as Record<string,unknown>,fields=Object.keys(row);if(fields.length>MAX_COLUMNS)throw new UnsafeStructuredImportError("JSON_COLUMN_LIMIT_EXCEEDED",`JSON row ${index+1} exceeds ${MAX_COLUMNS} fields.`);for(const field of fields)if(allowed&&!allowed.has(field))throw new UnsafeStructuredImportError("JSON_FIELD_NOT_ALLOWED",`Field '${field}' is not importable.`);return Object.freeze({...row});}));
}

function validateHeaders(headers:readonly string[],allowedFields:readonly string[]|undefined,label:string):void{if(!headers.length||headers.some(header=>!header))throw new UnsafeStructuredImportError(`${label}_HEADER_INVALID`,`${label} headings must be non-empty.`);if(headers.length>MAX_COLUMNS)throw new UnsafeStructuredImportError(`${label}_COLUMN_LIMIT_EXCEEDED`,`${label} may contain at most ${MAX_COLUMNS} columns.`);if(new Set(headers).size!==headers.length)throw new UnsafeStructuredImportError(`${label}_HEADER_DUPLICATE`,`${label} headings must be unique.`);if(allowedFields){const allowed=new Set(allowedFields);for(const header of headers)if(!allowed.has(header))throw new UnsafeStructuredImportError(`${label}_FIELD_NOT_ALLOWED`,`Column '${header}' is not an importable field.`);}}

function decodeUtf8(bytes:Uint8Array,label:string):string{try{const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);if(text.includes("\0"))throw new Error("nul");return text.replace(/^\uFEFF/,"");}catch{throw new UnsafeStructuredImportError(`${label}_ENCODING_INVALID`,`${label} files must use valid UTF-8 without NUL bytes.`);}}

function parseCsvRecords(text:string):readonly (readonly string[])[]{const rows:string[][]=[];let row:string[]=[],field="",quoted=false,afterQuote=false;for(let index=0;index<text.length;index+=1){const character=text[index]!;if(quoted){if(character==='"'){if(text[index+1]==='"'){field+='"';index+=1;}else{quoted=false;afterQuote=true;}}else field+=character;continue;}if(afterQuote&&character!==","&&character!=="\r"&&character!=="\n")throw new UnsafeStructuredImportError("CSV_QUOTE_INVALID","CSV contains characters after a closing quote.");if(character==='"'){if(field)throw new UnsafeStructuredImportError("CSV_QUOTE_INVALID","CSV quotes must begin at the start of a field.");quoted=true;afterQuote=false;}else if(character===","){row.push(field);field="";afterQuote=false;}else if(character==="\n"||character==="\r"){if(character==="\r"&&text[index+1]==="\n")index+=1;row.push(field);rows.push(row);row=[];field="";afterQuote=false;}else{field+=character;afterQuote=false;}}if(quoted)throw new UnsafeStructuredImportError("CSV_QUOTE_UNTERMINATED","CSV contains an unterminated quoted field.");if(field||row.length)row.push(field),rows.push(row);return Object.freeze(rows.map(item=>Object.freeze(item)));}
