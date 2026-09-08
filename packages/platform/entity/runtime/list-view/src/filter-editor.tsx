"use client";
import React, { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import { Button, Input, Select } from "@athyper/platform-ui";
import { CheckIcon, ChevronDownIcon } from "@athyper/platform-icons";
import type { EntityListDescriptorV1, ListFieldDescriptorV1, ListFilterOperator, ListFilterV1 } from "@athyper/contract-platform-entity-list";
import { filterInputValue } from "./state";

export const FilterChoiceLoader = createContext<((field: string) => Promise<void>) | undefined>(undefined);

type Recent = { operator: ListFilterOperator; value: string };
export function recentFilterKey(descriptor: EntityListDescriptorV1): string {
  return `athyper.entity-list.recent.${descriptor.plane}.${descriptor.entity.code}.${descriptor.scope.fingerprint}`;
}
function readRecent(key: string | undefined, field: ListFieldDescriptorV1): Recent[] {
  if (!key) return [];
  try {
    const values: unknown = JSON.parse(window.sessionStorage.getItem(`${key}.${field.key}`) ?? "[]");
    return Array.isArray(values) ? values.filter((item): item is Recent => !!item && typeof item.value === "string" && field.filterOperators.includes(item.operator) && !filterValidationError(field, item.operator, item.value)).slice(0, 5) : [];
  } catch { return []; }
}
export function rememberFilters(key: string, filters: readonly ListFilterV1[], fields: readonly ListFieldDescriptorV1[]): void {
  for (const filter of filters) {
    const field = fields.find(item => item.key === filter.field);
    if (!field || filter.operator === "is_null" || filter.operator === "is_not_null") continue;
    const entry = { operator: filter.operator, value: filterInputValue(filter, field.valueKind) };
    if (!entry.value || entry.value.length > 1024 || filterValidationError(field, entry.operator, entry.value)) continue;
    try { window.sessionStorage.setItem(`${key}.${field.key}`, JSON.stringify([entry, ...readRecent(key, field).filter(item => item.operator !== entry.operator || item.value !== entry.value)].slice(0, 5))); } catch { /* Storage is optional. */ }
  }
}
export function filterValidationError(field: ListFieldDescriptorV1 | undefined, operator: ListFilterOperator, raw: string): string | undefined {
  if (!field || !field.filterOperators.includes(operator)) return "Choose an available field and operator.";
  if (operator === "is_null" || operator === "is_not_null") return undefined;
  if (!raw.trim()) return "Select or enter a value.";
  if (operator === "relative") return RELATIVE_DATE_GROUPS.some(group => group.options.some(option => option.value === raw)) ? undefined : "Select a relative period.";
  const parts = operator === "between" || operator === "in" ? raw.split(",").map(value => value.trim()) : [raw.trim()];
  if (parts.some(value => !value) || operator === "between" && parts.length !== 2) return "Enter both range boundaries.";
  if (field.filterOptions?.length && parts.some(value => !field.filterOptions!.some(option => String(option.value) === value))) return "Select an available value.";
  if (field.valueKind === "reference" && !field.filterOptions?.length) return "Reference choices are unavailable.";
  if (field.valueKind === "boolean" && parts.some(value => !["true", "false"].includes(value))) return "Select Yes or No.";
  const numeric = ["integer", "decimal", "money"].includes(field.valueKind), temporal = ["date", "datetime"].includes(field.valueKind);
  if (numeric && parts.some(value => !Number.isFinite(Number(value)) || field.valueKind === "integer" && !Number.isInteger(Number(value)))) return "Enter a valid number.";
  if (temporal && parts.some(value => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return true;
    const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value.slice(0, 10) || field.valueKind === "date" && value.length !== 10 || field.valueKind === "datetime" && (Number.isNaN(new Date(value).valueOf()) || !value.includes("T"));
  })) return "Enter a valid date.";
  if (operator === "between" && (numeric ? Number(parts[0]) > Number(parts[1]) : temporal ? new Date(parts[0]!).valueOf() > new Date(parts[1]!).valueOf() : false)) return "The end must be on or after the start.";
  return undefined;
}
const RELATIVE_DATE_GROUPS = Object.freeze([
  Object.freeze({ label: "Days", options: Object.freeze([{ value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "tomorrow", label: "Tomorrow" }, { value: "last_7_days", label: "Last 7 days" }, { value: "last_30_days", label: "Last 30 days" }, { value: "last_90_days", label: "Last 90 days" }, { value: "next_7_days", label: "Next 7 days" }, { value: "next_30_days", label: "Next 30 days" }, { value: "next_90_days", label: "Next 90 days" }]) }),
  Object.freeze({ label: "Calendar periods", options: Object.freeze([{ value: "this_week", label: "This week" }, { value: "this_month", label: "This month" }, { value: "this_quarter", label: "This quarter" }]) }),
  Object.freeze({ label: "Years", options: Object.freeze([{ value: "last_365_days", label: "Last 12 months" }, { value: "next_365_days", label: "Next 12 months" }, { value: "last_year", label: "Last calendar year" }, { value: "this_year", label: "This year" }, { value: "next_year", label: "Next calendar year" }]) }),
] as const);

function RelativeDatePicker({ value, label, onChange }: { readonly value: string; readonly label: string; readonly onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null), listId = useId();
  const options = RELATIVE_DATE_GROUPS.flatMap((group) => group.options), selected = options.find((option) => option.value === value);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => { if (event.target && !root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close, true); document.addEventListener("focusin", close, true);
    return () => { document.removeEventListener("pointerdown", close, true); document.removeEventListener("focusin", close, true); };
  }, [open]);
  const focusOption = (position: "first" | "selected") => requestAnimationFrame(() => { const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])], target = position === "selected" ? items.find((item) => item.getAttribute("aria-selected") === "true") : undefined; (target ?? items[0])?.focus(); });
  const move = (event: React.KeyboardEvent<HTMLButtonElement>) => { const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])], index = items.indexOf(event.currentTarget); if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); root.current?.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus(); return; } const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? Math.min(index + 1, items.length - 1) : event.key === "ArrowUp" ? Math.max(index - 1, 0) : -1; if (next >= 0) { event.preventDefault(); items[next]?.focus(); } };
  return <div ref={root} className="a-entity-list__relative-date"><button type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} className="a-entity-list__relative-date-trigger" onClick={() => { const next = !open; setOpen(next); if (next) focusOption(value ? "selected" : "first"); }} onKeyDown={(event) => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key) && !open) { event.preventDefault(); setOpen(true); focusOption(value ? "selected" : "first"); } }}>{selected?.label ?? "Select a relative date"}<ChevronDownIcon size={16}/></button>{open ? <div id={listId} role="listbox" aria-label="Relative date range" className="a-entity-list__relative-date-options">{RELATIVE_DATE_GROUPS.map((group) => <section key={group.label}><strong>{group.label}</strong>{group.options.map((option) => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onKeyDown={move} onClick={() => { onChange(option.value); setOpen(false); root.current?.querySelector<HTMLButtonElement>('[role="combobox"]')?.focus(); }}>{option.value === value ? <CheckIcon size={15}/> : <span aria-hidden="true"/>}<span>{option.label}</span></button>)}</section>)}</div> : null}</div>;
}


function ChoicePicker({ field, label, value, multiple, onChange }: { field: ListFieldDescriptorV1; label: string; value: string; multiple: boolean; onChange: (value: string) => void }) {
  const [query, setQuery] = useState(""), [open, setOpen] = useState(false), [active, setActive] = useState(0), id = useId();
  const load = useContext(FilterChoiceLoader), pending = useRef(false);
  const [loading, setLoading] = useState(false), [loadError, setLoadError] = useState(false);
  const openChoices = () => {
    setOpen(true);
    if (!field.filterOptions?.length && load && !pending.current) {
      pending.current = true; setLoading(true); setLoadError(false);
      void load(field.key).catch(() => setLoadError(true)).finally(() => { pending.current = false; setLoading(false); });
    }
  };
  const options = field.filterOptions ?? [], selected = (multiple ? value.split(",") : [value]).map(item => item.trim()).filter(Boolean);
  const matches = options.filter(option => `${option.label} ${option.value}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  useEffect(() => { if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: "nearest" }); }, [active, open, id]);
  const choose = (option: (typeof options)[number]) => { const key = String(option.value); onChange(multiple ? (selected.includes(key) ? selected.filter(item => item !== key) : [...selected, key]).join(",") : key); setQuery(""); setActive(0); if (!multiple) setOpen(false); };
  return <div className="a-entity-list__choice" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setQuery(""); } }}>
    {selected.length ? <div className="a-entity-list__choice-chips">{selected.map(key => <button key={key} type="button" aria-label={`Remove ${options.find(option => String(option.value) === key)?.label ?? key}`} onClick={() => onChange(selected.filter(item => item !== key).join(","))}>{options.find(option => String(option.value) === key)?.label ?? key}<span aria-hidden="true"> ×</span></button>)}</div> : null}
    <Input role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={id} aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined} value={query} onClick={openChoices} placeholder={`Search ${field.label.toLocaleLowerCase()}…`} onFocus={openChoices} onChange={event => { setQuery(event.currentTarget.value); setActive(0); setOpen(true); }} onKeyDown={event => {
      if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      else if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
      else if (event.key === "Enter" && open) { event.preventDefault(); if (matches[active]) choose(matches[active]); }
    }}/>
    {open ? <div className="a-entity-list__choice-options"><div id={id} role="listbox" aria-label={`${field.label} choices`} aria-multiselectable={multiple || undefined}>{matches.map((option, index) => <div role="option" id={`${id}-${index}`} key={String(option.value)} aria-selected={selected.includes(String(option.value))} data-active={index === active || undefined} onPointerDown={event => event.preventDefault()} onClick={() => choose(option)}><span>{selected.includes(String(option.value)) ? "✓ " : ""}{option.label}</span>{field.valueKind === "reference" ? <small>{String(option.value)}</small> : null}</div>)}</div>{!matches.length ? <p role="status">{loading ? "Loading choices…" : loadError ? "Could not load choices. Focus the field to retry." : "No matching choices"}</p> : null}</div> : null}
  </div>;
}

function DateSetPicker({ field, value, label, onChange }: { field: ListFieldDescriptorV1; value: string; label: string; onChange: (value: string) => void }) {
  const [pending, setPending] = useState("");
  const dates = value.split(",").map(item => item.trim()).filter(Boolean);
  const valid = pending && !filterValidationError({ ...field, filterOperators: ["eq"] }, "eq", pending);
  return <div><div className="a-entity-list__choice-chips">{dates.map((date, index) => <button type="button" key={date} aria-label={`Remove ${date}`} onClick={() => onChange(dates.filter((_, i) => i !== index).join(","))}>{date} ×</button>)}</div><Input type={field.valueKind === "date" ? "date" : "datetime-local"} step="any" value={pending} aria-label={label} onChange={event => setPending(event.currentTarget.value)}/><Button size="small" variant="secondary" disabled={!valid || dates.includes(pending)} onClick={() => { onChange([...dates, pending].join(",")); setPending(""); }}>Add date</Button></div>;
}

export function FilterValueEditor({ field, operator, value, filterNumber, onChange, historyKey }: { readonly field: ListFieldDescriptorV1; readonly operator: ListFilterOperator; readonly value: string; readonly filterNumber: number; readonly onChange: (value: string) => void; readonly historyKey?: string }) {
  const label = `Value for ${field.label} filter ${filterNumber}`, errorId = useId(), [historyVersion, setHistoryVersion] = useState(0);
  const recent = readRecent(historyKey, field).filter(item => item.operator === operator);
  void historyVersion;
  if (operator === "is_null" || operator === "is_not_null") return <span className="a-entity-list__filter-no-value">No value required</span>;
  const error = value ? filterValidationError(field, operator, value) : undefined;
  const temporal = field.valueKind === "date" || field.valueKind === "datetime", type = field.valueKind === "date" ? "date" : field.valueKind === "datetime" ? "datetime-local" : ["integer", "decimal", "money"].includes(field.valueKind) ? "number" : "text";
  const step = field.valueKind === "integer" ? 1 : type === "number" || type === "datetime-local" ? "any" : undefined;
  let control: React.ReactNode;
  if (operator === "relative") control = <RelativeDatePicker label={label} value={value} onChange={onChange}/>;
  else if (operator === "between") {
    const [from = "", to = ""] = value.split(",", 2);
    control = <div className="a-entity-list__filter-range-inputs"><label>From<Input type={type} step={step} value={from.trim()} aria-label={`From ${label}`} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={event => onChange(`${event.currentTarget.value},${to.trim()}`)}/></label><label>To<Input type={type} step={step} min={temporal ? from.trim() || undefined : undefined} value={to.trim()} aria-label={`To ${label}`} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={event => onChange(`${from.trim()},${event.currentTarget.value}`)}/></label></div>;
  } else if (field.valueKind === "reference" || field.filterOptions?.length && operator === "in") control = <ChoicePicker key={`${field.key}-${operator}`} field={field} label={label} value={value} multiple={operator === "in"} onChange={onChange}/>;
  else if (field.filterOptions?.length || field.valueKind === "boolean") control = <Select aria-label={label} value={value} onChange={event => onChange(event.currentTarget.value)}><option value="">Select a value</option>{(field.filterOptions ?? [{ value: true, label: "Yes" }, { value: false, label: "No" }]).map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</Select>;
  else if (operator === "in" && temporal) control = <DateSetPicker key={field.key} field={field} value={value} label={label} onChange={onChange}/>;
  else control = <Input type={operator === "in" ? "text" : type} step={step} aria-label={label} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} value={value} onChange={event => onChange(event.currentTarget.value)} placeholder={operator === "in" ? "Enter values separated by commas" : "Enter a value"}/>;
  return <div className="a-entity-list__filter-control"><span className="a-entity-list__filter-label">Value</span>{control}{field.valueKind === "datetime" && operator !== "relative" ? <small>{`Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Choose an exact time, or use Relative period for whole days.`}</small> : null}{error ? <small id={errorId} role="alert" className="a-entity-list__filter-error">{error}</small> : null}{recent.length ? <div className="a-entity-list__recent"><Select aria-label={`Recent choices for ${field.label}`} value="" onChange={event => onChange(event.currentTarget.value)}><option value="">Recent choices</option>{recent.map(item => <option key={item.value} value={item.value}>{item.operator === "relative" ? RELATIVE_DATE_GROUPS.flatMap(group => group.options).find(option => option.value === item.value)?.label : item.value.split(",").map(key => field.filterOptions?.find(option => String(option.value) === key.trim())?.label ?? key).join(", ")}</option>)}</Select><Button variant="ghost" size="small" onClick={() => { try { window.sessionStorage.removeItem(`${historyKey}.${field.key}`); } catch {} setHistoryVersion(version => version + 1); }}>Clear recent</Button></div> : null}</div>;
}
