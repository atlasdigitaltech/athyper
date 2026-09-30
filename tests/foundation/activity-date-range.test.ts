import assert from "node:assert/strict";
import {test} from "node:test";
import {resolveActivityDateRange as resolve} from "../../packages/contracts/platform/entity-runtime/src/activity-date-range";
const now=new Date("2026-09-29T04:00:00Z");
test("calendar days use display timezone and include today",()=>{
 assert.deepEqual(resolve({period:"lastDays",timeZone:"Asia/Kuala_Lumpur"},7,90,now),{from:"2026-09-22T16:00:00.000Z",until:now.toISOString(),startDate:"2026-09-23",endDate:"2026-09-29"});
 assert.equal(resolve({period:"yesterday",timeZone:"Asia/Kuala_Lumpur"},30,90,now).until,"2026-09-28T15:59:59.999999Z");
});
test("weeks begin Monday and last month crosses year boundaries",()=>{
 assert.equal(resolve({period:"thisWeek",timeZone:"UTC"},30,90,now).startDate,"2026-09-28");
 const week=resolve({period:"lastWeek",timeZone:"UTC"},30,90,now);
 assert.equal(week.startDate,"2026-09-21");assert.equal(week.endDate,"2026-09-27");
 const month=resolve({period:"lastMonth",timeZone:"UTC"},30,90,new Date("2026-01-02T00:00:00Z"));
 assert.equal(month.startDate,"2025-12-01");assert.equal(month.endDate,"2025-12-31");
});
test("DST days use local midnight rather than fixed 24 hour subtraction",()=>{
 const spring=resolve({period:"custom",timeZone:"America/New_York",startDate:"2026-03-08",endDate:"2026-03-08"},30,1,now);
 assert.equal(spring.from,"2026-03-08T05:00:00.000Z");assert.equal(spring.until,"2026-03-09T03:59:59.999999Z");
 const fall=resolve({period:"custom",timeZone:"America/New_York",startDate:"2025-11-02",endDate:"2025-11-02"},30,1,now);
 assert.equal(fall.from,"2025-11-02T04:00:00.000Z");assert.equal(fall.until,"2025-11-03T04:59:59.999999Z");
});
test("invalid, reversed, future and excessive dates are rejected",()=>{
 for(const [startDate,endDate] of [["2026-02-30","2026-03-01"],["2026-09-02","2026-09-01"],["2026-09-30","2026-09-30"],["2026-01-01","2026-09-29"]]) assert.throws(()=>resolve({period:"custom",timeZone:"UTC",startDate,endDate},30,90,now));
 assert.throws(()=>resolve({period:"today",timeZone:"Invalid/Zone"},30,90,now));
 assert.throws(()=>resolve({period:"lastDays",timeZone:"UTC"},91,90,now));
 assert.throws(()=>resolve({period:"lastMonth",timeZone:"UTC"},7,7,now));
});
