import { describe,expect,it } from "vitest";
import type { BudgetState,BudgetTransaction } from "@athyper/server-contract-finance";
import { applyBudgetTransition,rebuildFromLog } from "./budget-service.js";

const zero:BudgetState={openingAmount:"0.0000",reservedAmount:"0.0000",consumedAmount:"0.0000",releasedAmount:"0.0000",adjustedAmount:"0.0000",availableAmount:"0.0000"};
describe("budget state machine",()=>{
  it("moves a reservation into consumption without charging availability twice",()=>{const allocated=applyBudgetTransition(zero,"allocate","100.0000","debit"),reserved=applyBudgetTransition(allocated,"reserve","40.1000","debit"),consumed=applyBudgetTransition(reserved,"consume","10.1000","debit");expect(reserved.availableAmount).toBe("59.9000");expect(consumed).toMatchObject({reservedAmount:"40.1000",consumedAmount:"10.1000",releasedAmount:"10.1000",availableAmount:"59.9000"});});
  it("rejects release beyond the outstanding reservation",()=>{const allocated=applyBudgetTransition(zero,"allocate","10.0000","debit");expect(()=>applyBudgetTransition(allocated,"release","0.0001","debit")).toThrow();});
  it("rebuilds from zero and verifies every immutable resulting state",()=>{const first=applyBudgetTransition(zero,"allocate","25.0000","debit"),second=applyBudgetTransition(first,"reserve","5.0000","debit"),entries=[entry("one","allocate","25.0000",zero,first),entry("two","reserve","5.0000",first,second)];expect(rebuildFromLog(entries)).toEqual(second);expect(()=>rebuildFromLog([{...entries[0]!,resultingState:{...first,availableAmount:"24.0000"}}])).toThrow();});
});
function entry(id:string,transactionType:BudgetTransaction["transactionType"],amount:string,previousState:BudgetState,resultingState:BudgetState):BudgetTransaction{return{id,budgetProfileId:"profile",budgetAllocationId:"allocation",projectId:"project",projectWbsId:"wbs",transactionType,direction:"debit",amount,currencyCode:"USD",fiscalYear:2026,periodNumber:1,effectiveDate:"2026-01-01",sourceDocumentType:"test",sourceDocumentId:"source",idempotencyKey:id,previousState,resultingState,performedAt:"2026-01-01T00:00:00.000Z",performedBy:"actor",metadata:{}};}
