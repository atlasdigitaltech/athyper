import {describe,expect,it} from "vitest";
import {SUPPLIER_APPLICANT_STATES,applicantPresentation,projectApplicantPayload} from "./applicant-experience";

describe("R3 restricted supplier applicant experience",()=>{
  it("publishes explicit correction, approval, completion, denial and failure states",()=>{expect(SUPPLIER_APPLICANT_STATES).toEqual(expect.arrayContaining(["accept","returned","validation_failed","pending_approval","complete","unauthorized","error"]));expect(applicantPresentation("returned")).toMatchObject({state:"returned",title:"Changes requested"});expect(applicantPresentation("pending_approval").detail).toMatch(/independent review/i);expect(applicantPresentation("materialized").state).toBe("complete");});
  it("projects only applicant-editable supplier identity values",()=>{expect(projectApplicantPayload({legalName:"Supplier",registrationNumber:"REG-1",internalWorkflow:{approver:"secret"},bankAccount:"secret"})).toEqual({legalName:"Supplier",registrationNumber:"REG-1"});});
});
