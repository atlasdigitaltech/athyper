import {expect,it} from "vitest";
import {restrictedValueFromStorage} from "../business-partner/protected-values/storage-contract.js";
import {relationshipScanBudget} from "../business-partner/relationships/scan-budget.js";

it("recognizes token-only bank storage without inferring permission",()=>{
 expect(restrictedValueFromStorage({protectedValueToken:"bank:synthetic-test"},undefined,true)).toEqual({tokenOrValue:"bank:synthetic-test",protected:true});
 expect(restrictedValueFromStorage({},"synthetic-plaintext",true)).toBeNull();
});
it.each([
 {protected:false,protectedValueToken:"bank:synthetic-test"},
 {protected:"true",protectedValueToken:"bank:synthetic-test"},
 {protected:true},
 {protected:true,protectedValueToken:"bank:../invalid"},
 {protectedValueToken:42},
 []
])("rejects inconsistent protected storage: %j",metadata=>{
 expect(restrictedValueFromStorage(metadata,"synthetic-value")).toBeNull();
});
it("supports explicit legacy representations without treating unresolved tokens as plaintext",()=>{
 expect(restrictedValueFromStorage({protected:true},"identifier:synthetic-test")).toEqual({tokenOrValue:"identifier:synthetic-test",protected:true});
 expect(restrictedValueFromStorage({},"synthetic-value")).toEqual({tokenOrValue:"synthetic-value",protected:false});
 expect(restrictedValueFromStorage({},"identifier:synthetic-test")).toBeNull();
});
it("bounds the combined relationship scan and fails rather than silently truncating",()=>{
 const consume=relationshipScanBudget(4);consume(2);consume(2);
 expect(()=>consume(1)).toThrow("Relationship scan limit reached");
});
