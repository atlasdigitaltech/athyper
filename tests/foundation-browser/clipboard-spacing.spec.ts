import {buildSync} from "esbuild";
import {test,expect} from "@playwright/test";
const bundle=buildSync({entryPoints:["packages/platform/communications/collaboration-ui/src/clipboard-converter.ts"],bundle:true,write:false,format:"iife",globalName:"clipboard",platform:"browser",nodePaths:["apps/neon/node_modules"]}).outputFiles[0]!.text;
test.beforeEach(async({page})=>{await page.goto("about:blank");await page.addScriptTag({content:bundle});});
test("Word layout whitespace does not add paragraphs or table-cell padding",async({page})=>{
 const result=await page.evaluate(()=>{
  const c=(window as any).clipboard;
  const convert=(html:string)=>c.convertClipboard({getData:(type:string)=>type==="text/html"?html:""}).document;
  const pretty='<div class="WordSection1">\n<p class="MsoNormal">Scope</p>\n<p>\u00a0\u00a0 1. Outbound <b>Payment</b> <i>WPS</i></p>\n<table>\n<tr><td>\n<p>A</p>\n</td><td>\n<p>B</p>\n</td></tr>\n</table>\n</div>';
  const doc=convert(pretty), compact=convert(pretty.replace(/>\n</g,"><"));
  return {doc,compact,text:c.serializeForClipboard(doc)["text/plain"],roundtrip:convert(c.serializeForClipboard(doc)["text/html"])};
 });
 expect(result.doc).toEqual(result.compact);expect(result.doc.content).toHaveLength(3);
 expect(result.doc.content[2].content[0].content[0].content).toEqual([{type:"paragraph",content:[{type:"text",text:"A"}]}]);
 expect(result.text).toContain("1. Outbound Payment WPS");expect(result.text).not.toMatch(/\n{3}|\u00a0/);
 expect(result.roundtrip).toEqual(result.doc);
});
test("Word empty blocks collapse without removing inline word separators",async({page})=>{
 const result=await page.evaluate(()=>{const c=(window as any).clipboard;return c.convertClipboard({getData:(t:string)=>t==="text/html"?'<div class="WordSection1"><p>&nbsp;</p><p><b>Hello</b> <i>world</i></p><p></p><p>   </p><p>End</p><p></p></div>':""}).document;});
 expect(result.content).toHaveLength(3);expect(result.content[1]).toEqual({type:"paragraph",content:[]});
 expect(result.content[0].content.map((n:any)=>n.text).join("")).toBe("Hello world");
});
test("editor input retains authored spaces and empty paragraphs",async({page})=>{
 const result=await page.evaluate(()=>{const c=(window as any).clipboard;return c.convertClipboard({getData:(t:string)=>t==="text/html"?'<p>  typed  text </p><p></p><p></p>':""},{editorInput:true}).document;});
 expect(result.content).toHaveLength(3);expect(result.content[0].content[0].text).toBe("  typed  text ");
});
test("plain text and preformatted paste keep explicit line breaks and code indentation",async({page})=>{
 const result=await page.evaluate(()=>{const c=(window as any).clipboard;const plain=c.convertClipboard({getData:(t:string)=>t==="text/plain"?"First\nSecond\n\nThird":""}).document;const code=c.convertClipboard({getData:(t:string)=>t==="text/html"?'<pre>  first\n    second</pre>':""}).document;return {plain,code,html:c.serializeForClipboard(plain)["text/html"]};});
 expect(result.plain.content[0].content[1]).toEqual({type:"hardBreak"});expect(result.html).toContain("First<br>Second");
 expect(result.code.content[0].content).toEqual([{type:"text",text:"  first",marks:[{type:"code"}]},{type:"hardBreak"},{type:"text",text:"    second",marks:[{type:"code"}]}]);
});
