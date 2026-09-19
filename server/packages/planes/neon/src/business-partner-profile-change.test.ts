import {describe, expect, it} from "vitest";
import {compareProfileChange, profileChangeFields, resolveProfileChange} from "./business-partner-profile-change.js";

function input() {return {baselineSnapshotId:"a",incomingSnapshotId:"b",businessPartnerId:"bp",targetVersion:3,
  baseline:{legalName:"Original",description:"Old",websiteUrl:"https://old.example"},
  incoming:{legalName:"Incoming",description:"Old",websiteUrl:"https://new.example"},
  current:{legalName:"Local",description:"Local description",websiteUrl:"https://old.example"},
  acceptedBaselinePaths:profileChangeFields.map(field=>`partner.${field}`)};}
describe("MESH three-way profile change",()=>{
  it("distinguishes source-only, local-only, conflicts, unchanged and converged fields",()=>{
    const value=compareProfileChange(input());
    expect(value.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({path:"partner.legalName",classification:"conflict"}),
      expect.objectContaining({path:"partner.description",classification:"local_only"}),
      expect.objectContaining({path:"partner.websiteUrl",classification:"source_only"}),
      expect.objectContaining({path:"partner.legalForm",classification:"unchanged"}),
    ]));
    expect(compareProfileChange({...input(),current:{...input().current,legalName:"Incoming"}}).fields.find(f=>f.path==="partner.legalName")?.classification).toBe("converged");
  });
  it("never treats an unaccepted source field as an accepted baseline",()=>{
    expect(compareProfileChange({...input(),acceptedBaselinePaths:[]}).fields.every(f=>f.classification==="unbased")).toBe(true);
  });
  it("requires explicit choices, rejects stale fingerprints and excludes sensitive/authority fields",()=>{
    const preview=compareProfileChange(input()), decisions=Object.fromEntries(preview.fields.map(f=>[f.path,"local" as const]));
    expect(()=>resolveProfileChange(preview,preview.fingerprint,{})).toThrow("DECISION_REQUIRED");
    expect(()=>resolveProfileChange(preview,"old",decisions)).toThrow("STALE");
    expect(()=>resolveProfileChange(preview,preview.fingerprint,{...decisions,"partner.bankAccount":"source"})).toThrow("FIELD_INVALID");
    expect(resolveProfileChange(preview,preview.fingerprint,decisions).proposed["partner.legalName"]).toBe("Local");
    expect(preview.fields.some(f=>/accountCode|bank|tax|status|role/i.test(f.path))).toBe(false);
  });
  it("changes the fingerprint when source or canonical version changes and rejects structured values",()=>{
    expect(compareProfileChange({...input(),targetVersion:4}).fingerprint).not.toBe(compareProfileChange(input()).fingerprint);
    expect(()=>compareProfileChange({...input(),incoming:{legalName:{unsafe:true}}})).toThrow("VALUE_INVALID");
  });
});
