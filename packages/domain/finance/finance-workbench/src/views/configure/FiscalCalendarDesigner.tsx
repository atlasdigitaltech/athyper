"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, Loader2, Plus, Save, Trash2, WandSparkles } from "lucide-react";
import {
  Badge, Button, Input, Label, Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue, Skeleton,
} from "@athyper/ui/primitives";
import {
  useAssignFiscalCalendar,
  useFiscalCalendarDesigner,
  useFiscalCalendarPreview,
  useGenerateFiscalPeriods,
  useRetireFiscalCalendar,
  useSaveFiscalCalendar,
  type FiscalCalendarConfig,
  type FiscalCalendarRule,
  type FiscalCalendarSavePayload,
  type FiscalCalendarType,
} from "../../hooks/useFiscalCalendarDesigner";

const CURRENT_FISCAL_YEAR = new Date().getFullYear();

interface FormState {
  code: string;
  name: string;
  description: string;
  calendarType: FiscalCalendarType;
  fiscalYearLabelRule: "start_year" | "end_year";
  yearStartRule: "fixed_date" | "first_on_or_after" | "last_on_or_before" | "nearest_weekday";
  anchorMonth: number;
  anchorDay: number;
  weekStartDay: number;
  periodsPerYear: number;
  leapWeekRule: "none" | "last_period";
}

const EMPTY_FORM: FormState = {
  code: "CALENDAR_YEAR",
  name: "Calendar Year",
  description: "",
  calendarType: "monthly",
  fiscalYearLabelRule: "start_year",
  yearStartRule: "fixed_date",
  anchorMonth: 1,
  anchorDay: 1,
  weekStartDay: 1,
  periodsPerYear: 12,
  leapWeekRule: "none",
};

export function FiscalCalendarDesigner({ companyCode }: { companyCode: string }) {
  const designer = useFiscalCalendarDesigner(companyCode);
  const save = useSaveFiscalCalendar(companyCode);
  const assign = useAssignFiscalCalendar(companyCode);
  const generate = useGenerateFiscalPeriods(companyCode);
  const retire = useRetireFiscalCalendar(companyCode);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [previewYear, setPreviewYear] = useState(CURRENT_FISCAL_YEAR);
  const [message, setMessage] = useState<string | null>(null);
  const [ruleDrafts, setRuleDrafts] = useState<FiscalCalendarRule[]>([]);

  const selected = useMemo(
    () => designer.data?.calendars.find((calendar) => calendar.id === selectedId) ?? null,
    [designer.data?.calendars, selectedId],
  );
  const currentAssignment = designer.data?.assignments[0] ?? null;
  const preview = useFiscalCalendarPreview(companyCode, selectedId, previewYear);

  useEffect(() => {
    if (selectedId || !designer.data) return;
    const initial = designer.data.assignments[0]?.calendarId ?? designer.data.calendars[0]?.id;
    if (initial) setSelectedId(initial);
  }, [designer.data, selectedId]);

  useEffect(() => {
    if (selected) {
      setForm(formFromCalendar(selected));
      setRuleDrafts(selected.rules);
    }
  }, [selected]);

  if (designer.isLoading) {
    return <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-96 w-full" /></div>;
  }
  if (designer.isError) {
    return <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">Failed to load fiscal calendar setup.</p>;
  }

  const isBusy = save.isPending || assign.isPending || generate.isPending || retire.isPending;
  const generatedYear = designer.data?.generatedYears.find(
    (year) => year.calendarId === selectedId && year.fiscalYear === previewYear,
  );

  const handleTypeChange = (calendarType: FiscalCalendarType) => {
    const weekly = calendarType === "four_four_five" || calendarType === "four_five_four"
      || calendarType === "five_four_four" || calendarType === "thirteen_period";
    setForm((value) => ({
      ...value,
      calendarType,
      periodsPerYear: calendarType === "thirteen_period" ? 13 : calendarType === "custom" ? value.periodsPerYear : 12,
      leapWeekRule: weekly ? "last_period" : "none",
      yearStartRule: weekly
        ? (value.yearStartRule === "fixed_date" ? "nearest_weekday" : value.yearStartRule)
        : (calendarType === "monthly" ? "fixed_date" : value.yearStartRule),
    }));
  };

  const handleSave = async () => {
    setMessage(null);
    try {
      const preservesTemplate = selected
        && selected.calendarType === form.calendarType
        && selected.periodsPerYear === form.periodsPerYear;
      const payload: FiscalCalendarSavePayload = {
        ...form,
        description: form.description || null,
        calendarId: selected?.status === "draft" ? selected.id : undefined,
        rules: selected && preservesTemplate ? ruleDrafts : undefined,
      };
      const result = await save.mutateAsync(payload);
      setSelectedId(result.calendarId);
      setMessage(selected?.status === "active"
        ? `Created version ${result.versionNo} as a draft.`
        : `Draft saved with ${result.ruleCount} construction rules.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar could not be saved.");
    }
  };

  const handleAssign = async () => {
    if (!selectedId) return;
    setMessage(null);
    try {
      await assign.mutateAsync({ calendarId: selectedId, fiscalYearFrom: previewYear });
      setMessage(`Calendar activated for ${companyCode} from FY ${previewYear}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar could not be assigned.");
    }
  };

  const handleGenerate = async () => {
    if (!selectedId) return;
    setMessage(null);
    try {
      const result = await generate.mutateAsync({ calendarId: selectedId, fiscalYear: previewYear });
      setMessage(`Generated ${String(result["periodCount"] ?? "all")} periods and seeded book-period gates.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fiscal periods could not be generated.");
    }
  };

  const handleRetire = async () => {
    if (!selectedId) return;
    setMessage(null);
    try {
      await retire.mutateAsync(selectedId);
      setSelectedId("");
      setForm(EMPTY_FORM);
      setRuleDrafts([]);
      setMessage("Calendar version retired.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Calendar could not be retired.");
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Fiscal Calendar Designer</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Define once, preview exact dates, assign by fiscal year, then generate posting gates.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentAssignment ? (
              <Badge variant="success" size="sm">
                Assigned from FY {currentAssignment.fiscalYearFrom}
              </Badge>
            ) : <Badge variant="muted" size="sm">Not assigned</Badge>}
            <Button
              size="sm" variant="secondary"
              onClick={() => { setSelectedId(""); setForm(EMPTY_FORM); setRuleDrafts([]); setMessage(null); }}
              disabled={isBusy}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden />New calendar
            </Button>
          </div>
        </div>

        <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(340px,.95fr)]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Calendar version">
                <Select value={selectedId || "new"} onValueChange={(value) => {
                  if (value === "new") { setSelectedId(""); setForm(EMPTY_FORM); setRuleDrafts([]); }
                  else setSelectedId(value);
                  setMessage(null);
                }}>
                  <SelectTrigger><SelectValue placeholder="New calendar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New calendar</SelectItem>
                    {designer.data?.calendars.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id}>
                        {calendar.code} v{calendar.versionNo} · {calendar.status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Pattern">
                <Select value={form.calendarType} onValueChange={(value) => handleTypeChange(value as FiscalCalendarType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="four_four_five">4-4-5 retail</SelectItem>
                    <SelectItem value="four_five_four">4-5-4 retail</SelectItem>
                    <SelectItem value="five_four_four">5-4-4 retail</SelectItem>
                    <SelectItem value="thirteen_period">13 × 4 weeks</SelectItem>
                    <SelectItem value="custom">Custom / irregular</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Code">
                <Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />
              </Field>
              <Field label="Name">
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="Year starts in month">
                <Input type="number" min={1} max={12} value={form.anchorMonth}
                  onChange={(event) => setForm({ ...form, anchorMonth: Number(event.target.value) })} />
              </Field>
              <Field label="Anchor day">
                <Input type="number" min={1} max={31} value={form.anchorDay}
                  onChange={(event) => setForm({ ...form, anchorDay: Number(event.target.value) })} />
              </Field>
              <Field label="Start-date rule">
                <Select value={form.yearStartRule} onValueChange={(value) => setForm({ ...form, yearStartRule: value as FormState["yearStartRule"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed_date">Exact anchor date</SelectItem>
                    <SelectItem value="first_on_or_after">First weekday on/after</SelectItem>
                    <SelectItem value="last_on_or_before">Last weekday on/before</SelectItem>
                    <SelectItem value="nearest_weekday">Nearest weekday</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fiscal-year label">
                <Select value={form.fiscalYearLabelRule} onValueChange={(value) => setForm({ ...form, fiscalYearLabelRule: value as FormState["fiscalYearLabelRule"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="start_year">Year in which FY starts</SelectItem>
                    <SelectItem value="end_year">Year in which FY ends</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Normal periods">
                <Input type="number" min={1} max={16} value={form.periodsPerYear}
                  disabled={form.calendarType !== "custom"}
                  onChange={(event) => setForm({ ...form, periodsPerYear: Number(event.target.value) })} />
              </Field>
              <Field label="Week starts on">
                <Select value={String(form.weekStartDay)} onValueChange={(value) => setForm({ ...form, weekStartDay: Number(value) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Monday</SelectItem><SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem><SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem><SelectItem value="6">Saturday</SelectItem>
                    <SelectItem value="7">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Description">
              <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}
                placeholder="Purpose and accounting policy notes" />
            </Field>

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button size="sm" onClick={handleSave} disabled={isBusy || !form.code || !form.name}>
                {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                {selected?.status === "active" ? "Create new version" : "Save draft"}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleAssign} disabled={isBusy || !selectedId}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Activate & assign from FY {previewYear}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleGenerate}
                disabled={isBusy || !selectedId || currentAssignment?.calendarId !== selectedId}>
                {generate.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="mr-1.5 h-3.5 w-3.5" />}
                Generate FY {previewYear}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleRetire}
                disabled={isBusy || !selectedId || currentAssignment?.calendarId === selectedId}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />Retire
              </Button>
              {message && <span className="text-xs text-muted-foreground">{message}</span>}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <div>
                <h3 className="text-sm font-medium">Calendar preview</h3>
                <p className="text-xs text-muted-foreground">Same calculation used by generation.</p>
              </div>
              <div className="flex items-center gap-2">
                <Input className="h-8 w-24" type="number" min={1900} max={32767} value={previewYear}
                  onChange={(event) => setPreviewYear(Number(event.target.value))} />
                {generatedYear && <Badge variant="info" size="sm">generated</Badge>}
              </div>
            </div>
            <div className="max-h-[520px] overflow-auto">
              {!selectedId ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Save or select a calendar to preview exact dates.</p>
              ) : preview.isLoading ? (
                <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-8 w-full" />)}</div>
              ) : preview.isError ? (
                <p className="p-5 text-sm text-destructive">{preview.error.message}</p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card text-left text-muted-foreground">
                    <tr><th className="px-3 py-2">Period</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Start</th><th className="px-3 py-2">End</th><th className="px-3 py-2 text-right">Days</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.data?.periods.map((period) => (
                      <tr key={`${period.periodNumber}-${period.periodType}`} className={period.isAdjustment ? "bg-amber-500/5" : undefined}>
                        <td className="px-3 py-2"><span className="font-mono">P{String(period.periodNumber).padStart(2, "0")}</span><span className="ml-2 text-muted-foreground">{period.name}</span></td>
                        <td className="px-3 py-2"><Badge variant="outline" size="sm">{period.periodType}</Badge></td>
                        <td className="px-3 py-2 font-mono">{period.startDate}</td>
                        <td className="px-3 py-2 font-mono">{period.endDate}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{daysInclusive(period.startDate, period.endDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </section>

      {selected && (
        <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b p-4">
            <div><h3 className="text-sm font-medium">Construction rules</h3><p className="text-xs text-muted-foreground">Semantic period type drives adjustment behavior; period number does not.</p></div>
            <Badge variant="outline" size="sm">{ruleDrafts.length} rules</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground"><tr><th className="px-4 py-2">Sequence</th><th className="px-4 py-2">Period</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Duration</th><th className="px-4 py-2">Anchor</th><th className="px-4 py-2">Quarter</th><th className="px-4 py-2">Leap week</th></tr></thead>
              <tbody className="divide-y">
                {ruleDrafts.map((rule, ruleIndex) => <tr key={rule.id ?? rule.sequenceNo}>
                  <td className="px-4 py-2 tabular-nums">{rule.sequenceNo}</td><td className="px-4 py-2 font-mono">P{String(rule.periodNumber).padStart(2, "0")}</td>
                  <td className="px-4 py-2">{rule.periodType}</td>
                  <td className="px-4 py-2">
                    {selected.status === "draft" ? <div className="flex min-w-48 items-center gap-2">
                      <Input className="h-7 w-16" type="number" min={1} max={53} value={rule.durationValue}
                        onChange={(event) => updateRule(ruleDrafts, setRuleDrafts, ruleIndex, { durationValue: Number(event.target.value) })} />
                      <Select value={rule.durationUnit} onValueChange={(value) => updateRule(ruleDrafts, setRuleDrafts, ruleIndex, { durationUnit: value as FiscalCalendarRule["durationUnit"] })}>
                        <SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="point">point</SelectItem><SelectItem value="day">day</SelectItem><SelectItem value="week">week</SelectItem><SelectItem value="month">month</SelectItem></SelectContent>
                      </Select>
                    </div> : <>{rule.durationValue} {rule.durationUnit}{rule.durationValue === 1 ? "" : "s"}</>}
                  </td>
                  <td className="px-4 py-2">{rule.anchor}</td><td className="px-4 py-2">{rule.quarterNumber ? `Q${rule.quarterNumber}` : "—"}</td>
                  <td className="px-4 py-2">{rule.absorbsLeapWeek ? "absorbs" : "—"}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

function updateRule(
  rules: FiscalCalendarRule[],
  setRules: (rules: FiscalCalendarRule[]) => void,
  index: number,
  patch: Partial<FiscalCalendarRule>,
) {
  setRules(rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule));
}

function formFromCalendar(calendar: FiscalCalendarConfig): FormState {
  return {
    code: calendar.code, name: calendar.name, description: calendar.description ?? "",
    calendarType: calendar.calendarType, fiscalYearLabelRule: calendar.fiscalYearLabelRule,
    yearStartRule: calendar.yearStartRule, anchorMonth: calendar.anchorMonth,
    anchorDay: calendar.anchorDay, weekStartDay: calendar.weekStartDay,
    periodsPerYear: calendar.periodsPerYear, leapWeekRule: calendar.leapWeekRule,
  };
}

function daysInclusive(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}
