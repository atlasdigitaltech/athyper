import {describe,expect,it} from "vitest";
import {MESH_ACCEPTED_PROFILE_FIELDS,safeProposalFields} from "./mesh-proposal-experience";

describe("R3 MESH proposal field boundary",()=>{it("requires legal name and rejects direct-authority or sensitive paths",()=>{expect(safeProposalFields(["partner.websiteUrl","partner.bankAccount","internal.status"])).toEqual(["partner.legalName","partner.websiteUrl"]);expect(MESH_ACCEPTED_PROFILE_FIELDS).not.toEqual(expect.arrayContaining(["partner.bankAccount","partner.taxIdentifiers","internal.status"]));});});
