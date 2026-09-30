import {it,expect} from "vitest";
import {parseEntityListScopeCoordinate} from "../entity-list-routes.js";
const id="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
it("parses and canonicalizes multi-select query coordinates",()=>{expect(parseEntityListScopeCoordinate({companyCodeIds:`${other},${id},${id}`,operatingOrganizationIds:other})).toEqual({companyCodeIds:[id,other],operatingOrganizationIds:[other]});});
it.each([{companyCodeIds:""},{companyCodeIds:"bad"},{companyCodeIds:[id]},{companyCodeIds:Array(101).fill(id).join(",")},{companyCodeIds:id,companyCodeId:id,legalEntityId:other}])("rejects invalid selections",value=>expect(()=>parseEntityListScopeCoordinate(value)).toThrow());
