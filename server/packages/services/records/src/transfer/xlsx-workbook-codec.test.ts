import { describe,expect,it } from "vitest";
import ExcelJS from "exceljs";
import { createXlsxExport,createXlsxTemplate,inspectXlsxContainer,parseXlsxWorkbook,UnsafeWorkbookError } from "./xlsx-workbook-codec.js";

describe("XLSX workbook codec",()=>{
  it("creates a version-bound template and parses its Data rows",async()=>{const bytes=await createXlsxTemplate({entityCode:"business_partner",descriptorHash:"a".repeat(64),fields:[{key:"code",label:"Code",required:true,example:"BP-1"},{key:"active",label:"Active",required:false,example:true}]});inspectXlsxContainer(bytes);await expect(parseXlsxWorkbook(bytes,{maxRows:10,allowedFields:["code","active"]})).resolves.toEqual([{code:"BP-1",active:true}]);});
  it("rejects formulas before governed validation",async()=>{const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Data");sheet.addRow(["code"]);sheet.getCell("A2").value={formula:"1+1",result:2};const bytes=new Uint8Array(await workbook.xlsx.writeBuffer());await expect(parseXlsxWorkbook(bytes,{maxRows:10})).rejects.toMatchObject({code:"XLSX_FORMULA_NOT_ALLOWED"} satisfies Partial<UnsafeWorkbookError>);});
  it("streams formula-safe XLSX exports with governed export information",async()=>{async function* rows(){yield{code:"=2+2",name:"Acme"};}const chunks:Uint8Array[]=[];for await(const chunk of createXlsxExport(["code","name"],rows(),{information:{entityCode:"party",descriptorHash:"a".repeat(64)}}))chunks.push(chunk);const bytes=Uint8Array.from(Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)))),workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes.buffer);expect(workbook.getWorksheet("Data")?.getCell("A2").value).toBe("'=2+2");expect(workbook.getWorksheet("Export information")?.getCell("B1").value).toBe("party");});
});
