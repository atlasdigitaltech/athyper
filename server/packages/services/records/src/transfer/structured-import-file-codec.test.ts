import {describe,expect,it} from "vitest";
import {parseCsvImport,parseJsonImport,structuredImportFormat} from "./structured-import-file-codec.js";

const encode=(value:string)=>new TextEncoder().encode(value);

describe("structured import files",()=>{
  it("parses RFC 4180 quoting, UTF-8 BOM, and CRLF",()=>{expect(parseCsvImport(encode('\uFEFFcode,description\r\n"BP,001","Line 1\nLine 2"\r\n'),{maxRows:10,allowedFields:["code","description"]})).toEqual([{code:"BP,001",description:"Line 1\nLine 2"}]);});
  it("rejects duplicate or unpublished CSV headings",()=>{expect(()=>parseCsvImport(encode("code,code\n1,2"),{maxRows:10})).toThrow(/unique/);expect(()=>parseCsvImport(encode("code,secret\n1,2"),{maxRows:10,allowedFields:["code"]})).toThrow(/not an importable field/);});
  it("accepts JSON arrays and rows envelopes",()=>{expect(parseJsonImport(encode('[{"code":"BP-1"}]'),{maxRows:10,allowedFields:["code"]})).toEqual([{code:"BP-1"}]);expect(parseJsonImport(encode('{"rows":[{"code":"BP-2"}]}'),{maxRows:10,allowedFields:["code"]})).toEqual([{code:"BP-2"}]);});
  it("allows only safe published file extensions",()=>{expect(structuredImportFormat("records.CSV")).toBe("csv");expect(()=>structuredImportFormat("../records.csv")).toThrow(/safe/);expect(()=>structuredImportFormat("records.xlsm")).toThrow(/Only CSV/);});
});
