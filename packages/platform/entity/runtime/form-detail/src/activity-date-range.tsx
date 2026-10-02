"use client";
import { useState } from "react";
import { Button, ChoiceSelect, type ChoiceOption } from "@athyper/platform-ui";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { activityLocalDate, resolveActivityDateRange, type ActivityDateRange, type ActivityDescription, type ActivityPeriod } from "@athyper/contract-platform-entity-runtime";
export type ActivityRangeSelection = Omit<ActivityDateRange,"timeZone">;
export function readActivityRange(): ActivityRangeSelection {
  const q=new URLSearchParams(typeof window==="undefined"?"":window.location.search);
  const period=q.get("activityPeriod") ?? "lastDays";
  return {period:period as ActivityPeriod,...(q.has("activityStart")?{startDate:q.get("activityStart")!}:{}),...(q.has("activityEnd")?{endDate:q.get("activityEnd")!}:{})};
}
export function ActivityDateRangeControl({description,days,selection,onChange}:{description:Pick<ActivityDescription,"defaultRangeDays"|"maxRangeDays"|"supportsCalendarRanges">;days:number;selection:ActivityRangeSelection;onChange:(selection:ActivityRangeSelection,days:number)=>void}) {
  const intl=useEntityI18n(), zone=intl.localization.timeZone;
  const [custom,setCustom]=useState(false),[start,setStart]=useState(selection.startDate??""),[end,setEnd]=useState(selection.endDate??"");
  const now=new Date(), today=activityLocalDate(now,zone);
  const valid=(value:ActivityRangeSelection,n=days)=>{try {resolveActivityDateRange({...value,timeZone:zone},n,description.maxRangeDays,now);return true;}catch{return false;}};
  const allowed=(period:ActivityPeriod)=>valid({period});
  const lastDays=[...new Set([7,30,90,description.defaultRangeDays,days])].filter(n=>n>0&&n<=description.maxRangeDays).sort((a,b)=>a-b);
  const weeks=["thisWeek","lastWeek"].filter(p=>allowed(p as ActivityPeriod));
  const months=["thisMonth","lastMonth"].filter(p=>allowed(p as ActivityPeriod));
  const label=(key:string)=>intl.message(`activity.period.${key}`);
  const group=(key:string,values:readonly string[]):ChoiceOption[]=>values.map(value=>({value,label:label(value),group:label(key)}));
  const periodOptions:readonly ChoiceOption[]=[
    ...group("days",description.supportsCalendarRanges?["today","yesterday"].filter(p=>allowed(p as ActivityPeriod)):[]),
    ...lastDays.map(n=>({value:`last:${n}`,label:intl.message("activity.period.lastDays",{count:n}),group:label("days")})),
    ...(description.supportsCalendarRanges?[...group("weeks",weeks),...group("months",months),{value:"custom",label:label("dateRange"),group:label("custom")}]:[]),
  ];
  return <div className="a-activity-date-range">
    <label className="a-entity-activity__range">
      <span>{intl.message("activity.dateRange")}</span>
      <ChoiceSelect title={intl.message("activity.period.limit",{count:description.maxRangeDays})} value={custom?"custom":!description.supportsCalendarRanges?`last:${days}`:selection.period==="lastDays"?`last:${days}`:selection.period} options={periodOptions} onChange={value=>{
        if(value==="custom") {setStart(selection.startDate??today);setEnd(selection.endDate??today);setCustom(true);return;}
        setCustom(false);
        onChange({period:value.startsWith("last:")?"lastDays":value as ActivityPeriod},value.startsWith("last:")?Number(value.slice(5)):days);
      }}/>
    </label>
    {description.supportsCalendarRanges ? <small>{zone}{selection.period==="custom"&&!custom&&valid(selection)?` · ${intl.date(selection.startDate!+"T12:00:00Z",{timeZone:"UTC"})} – ${intl.date(selection.endDate!+"T12:00:00Z",{timeZone:"UTC"})}`:""}</small>:null}
    {custom ? <div className="a-activity-date-range__custom">
      <label>{label("start")}<input type="date" value={start} max={end||today} onChange={e=>setStart(e.target.value)}/></label>
      <label>{label("end")}<input type="date" value={end} min={start} max={today} onChange={e=>setEnd(e.target.value)}/></label>
      <small>{intl.message("activity.period.limit",{count:description.maxRangeDays})}</small>
      {start&&end&&!valid({period:"custom",startDate:start,endDate:end})?<p role="alert">{label("invalid")}</p>:null}
      <Button disabled={!valid({period:"custom",startDate:start,endDate:end})} onClick={()=>{onChange({period:"custom",startDate:start,endDate:end},days);setCustom(false);}}>{label("apply")}</Button>
      <Button variant="secondary" onClick={()=>setCustom(false)}>{intl.message("action.cancel")}</Button>
    </div>:null}
  </div>;
}
