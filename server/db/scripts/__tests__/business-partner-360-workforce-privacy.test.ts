import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import test from "node:test";

const root=resolve(import.meta.dirname,"../../.."),read=(path:string)=>readFile(resolve(root,path),"utf8");

test("BS360-07 selects half-open effective workforce ranges",async()=>{const source=await read("packages/services/master-data/src/kysely-business-partner-360-workforce.ts");for(const pattern of[/hire_date<=/,/termination_date>/,/assignment\.effective_from<=/,/assignment\.effective_until>/,/engagement\.start_date<=/,/engagement\.end_date>/,/effective_from<=/,/effective_until>/])assert.match(source,pattern);});
test("BS360-07 excludes sensitive profiles, evidence, readiness, compensation and rates",async()=>{const source=await read("packages/services/master-data/src/kysely-business-partner-360-workforce.ts");assert.doesNotMatch(source,/person_sensitive_profile|date_of_birth|national_id|passport|protected_attributes|checklist|readiness|bill_rate|regular_rate|compensation/i);});
test("BS360-07 clears reveal state on close, query change, abort, expiry and unmount",async()=>{const shell=await read("../packages/planes/neon/business-partner/src/360/components/workforce-section.tsx");assert.match(shell,/setReveal\(undefined\)/);assert.match(shell,/controller\.current\?\.abort/);assert.match(shell,/clearTimeout/);assert.match(shell,/\[cleanupKey\]/);assert.doesNotMatch(shell,/localStorage|sessionStorage|indexedDB/);});
test("BS360-07 keeps person and workforce fields out of MESH and generic BP exports",async()=>{const[mesh,records]=await Promise.all([read("packages/services/publication/src/business-partner-foundation-definition.ts"),read("packages/services/records/src/transfer/transfer-service.ts")]);assert.match(mesh,/person\./);assert.match(mesh,/workforce\./);assert.match(records,/BUSINESS_PARTNER_EXPORT_WORKFORCE_FORBIDDEN/);assert.match(records,/entityCode!=="business_partner"/);});
