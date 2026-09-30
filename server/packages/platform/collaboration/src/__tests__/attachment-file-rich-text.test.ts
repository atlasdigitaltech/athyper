import {describe,it,expect} from "vitest";
import {projectRichText} from "../rich-text.js";
describe("file attachment rich text",()=>{
 it("retains an authorized attachment reference without an inline source URL",()=>{
  const id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const result=projectRichText({type:"doc",schema:"athyper.rich-text/1.0",content:[{type:"attachmentFile",attrs:{attachmentId:id,alt:"proof.pdf"}}]});
  expect(result.attachmentIds).toEqual([id]);
  expect(result.text).toContain("proof.pdf");
  expect(result.html).not.toContain("<img");
 });
});
