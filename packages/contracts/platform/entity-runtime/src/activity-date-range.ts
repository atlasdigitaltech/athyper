/** Gregorian calendar ranges in the same IANA zone used to display Activity. Weeks start Monday. */
export type ActivityPeriod = "lastDays" | "today" | "yesterday" | "thisWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "custom";
export interface ActivityDateRange { period: ActivityPeriod; timeZone: string; startDate?: string; endDate?: string; }
const dayMs = 86400000;
function dateMs(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error("Invalid date");
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) !== value) throw Error("Invalid date");
  return ms;
}
const shift = (value:string, days:number) => new Date(dateMs(value)+days*dayMs).toISOString().slice(0,10);
export function activityLocalDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone,calendar:"gregory",numberingSystem:"latn",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  return ["year","month","day"].map(key=>parts.find(p=>p.type===key)!.value).join("-");
}
/** Find the first instant of a civil day, including zones with midnight DST transitions. */
function startOfDate(value:string, zone:string): number {
  const target=dateMs(value);
  let lo=target-2*dayMs, hi=target+2*dayMs;
  while(lo<hi) {
    const mid=Math.floor((lo+hi)/2);
    if(activityLocalDate(new Date(mid),zone)<value) lo=mid+1; else hi=mid;
  }
  if(activityLocalDate(new Date(lo),zone)!==value) throw Error("Calendar date does not exist in this timezone");
  return lo;
}
export function resolveActivityDateRange(range:ActivityDateRange, days:number, maxDays:number, now:Date) {
  if(!range || typeof range.timeZone!=="string" || range.timeZone.length>100 || !Number.isFinite(now.getTime())) throw Error("Invalid range");
  const today=activityLocalDate(now,range.timeZone);
  let start=today, end=today;
  if(range.period!=="custom" && (range.startDate!==undefined || range.endDate!==undefined)) throw Error("Unexpected dates");
  switch(range.period) {
    case "today": break;
    case "yesterday": start=end=shift(today,-1); break;
    case "lastDays":
      if(!Number.isInteger(days)||days<1) throw Error("Invalid days");
      start=shift(today,1-days); break;
    case "thisWeek": case "lastWeek": {
      const weekday=(new Date(dateMs(today)).getUTCDay()+6)%7;
      start=shift(today,-weekday);
      if(range.period==="lastWeek") {end=shift(start,-1);start=shift(start,-7);}
      break;
    }
    case "thisMonth": start=today.slice(0,8)+"01"; break;
    case "lastMonth": end=shift(today.slice(0,8)+"01",-1);start=end.slice(0,8)+"01";break;
    case "custom": start=range.startDate??"";end=range.endDate??"";break;
    default: throw Error("Invalid period");
  }
  const count=(dateMs(end)-dateMs(start))/dayMs+1;
  if(count<1 || count>maxDays || end>today) throw Error("Range outside allowed limits");
  const from=new Date(startOfDate(start,range.timeZone)).toISOString();
  // Existing storage APIs use inclusive upper bounds with PostgreSQL microsecond precision.
  const next=startOfDate(shift(end,1),range.timeZone);
  const until=next>now.getTime() ? now.toISOString() : new Date(next-1000).toISOString().replace(/\.000Z$/, ".999999Z");
  return {from,until,startDate:start,endDate:end};
}
