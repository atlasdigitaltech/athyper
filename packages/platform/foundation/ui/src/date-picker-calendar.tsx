"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@athyper/platform-icons";
import "react-day-picker/style.css";

function date(value?: string): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const result = new Date(`${value}T12:00:00`);
  return Number.isFinite(result.getTime()) ? result : undefined;
}
function iso(value: Date): string {
  return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export default function DatePickerCalendar({
  value,
  min,
  max,
  required,
  onSelect,
}: {
  value: string;
  min?: string;
  max?: string;
  required?: boolean;
  onSelect(value: string): void;
}) {
  const today = new Date(),
    selected = date(value),
    from = date(min),
    until = date(max);
  const initial =
    selected ??
    (from && today < from ? from : until && today > until ? until : today);
  const todayValue = iso(today);
  const first =
    from ??
    new Date(Math.min(today.getFullYear() - 100, initial.getFullYear()), 0);
  const last =
    until ??
    new Date(Math.max(today.getFullYear() + 100, initial.getFullYear()), 11);
  const monthNumber = (day: Date) => day.getFullYear() * 12 + day.getMonth();
  const clampMonth = (day: Date) =>
    monthNumber(day) < monthNumber(first)
      ? first
      : monthNumber(day) > monthNumber(last)
        ? last
        : day;
  const [month, setMonth] = useState(() => clampMonth(initial));
  const [view, setView] = useState<"days" | "months" | "years">("days");
  const [yearStart, setYearStart] = useState(
    () => Math.floor(month.getFullYear() / 12) * 12,
  );
  const choices = useRef<HTMLDivElement>(null);
  const monthTrigger = useRef<HTMLButtonElement>(null);
  const yearTrigger = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<"months" | "years">("months");
  const restoreCaptionFocus = useRef(false);
  const monthName = new Intl.DateTimeFormat("en", { month: "long" }).format(
    month,
  );
  const show = (next: "months" | "years") => {
    returnTo.current = next;
    setYearStart(Math.floor(month.getFullYear() / 12) * 12);
    setView(next);
  };
  const back = () => {
    restoreCaptionFocus.current = true;
    setView("days");
  };
  useLayoutEffect(() => {
    if (view === "days") {
      if (restoreCaptionFocus.current) {
        restoreCaptionFocus.current = false;
        (returnTo.current === "months"
          ? monthTrigger
          : yearTrigger
        ).current?.focus();
      }
      return;
    }
    const buttons = choices.current?.querySelectorAll<HTMLButtonElement>(
      "button[data-choice]:not(:disabled)",
    );
    const target =
      choices.current?.querySelector<HTMLButtonElement>(
        'button[aria-pressed="true"]:not(:disabled)',
      ) ?? buttons?.[0];
    buttons?.forEach((button) => {
      button.tabIndex = button === target ? 0 : -1;
    });
    target?.focus();
  }, [view, yearStart]);
  const move = (direction: number) => {
    if (view === "years") setYearStart((current) => current + direction * 12);
    else
      setMonth((current) =>
        clampMonth(
          new Date(current.getFullYear(), current.getMonth() + direction, 1),
        ),
      );
  };
  const previousDisabled =
    view === "years"
      ? yearStart <= first.getFullYear()
      : monthNumber(month) <= monthNumber(first);
  const nextDisabled =
    view === "years"
      ? yearStart + 11 >= last.getFullYear()
      : monthNumber(month) >= monthNumber(last);

  return (
    <>
      <div
        className="a-date-picker__calendar"
        onKeyDown={(event) => {
          if (view !== "days" && event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            back();
          }
        }}
      >
        <div className="a-date-picker__heading">
          {view === "years" ? (
            <strong aria-live="polite">
              {yearStart}–{yearStart + 11}
            </strong>
          ) : (
            <div className="a-date-picker__caption">
              <button
                ref={monthTrigger}
                type="button"
                aria-label={`Choose month, ${monthName}`}
                aria-expanded={view === "months"}
                onClick={() => (view === "months" ? back() : show("months"))}
              >
                {monthName}
                <ChevronDownIcon size={14} />
              </button>
              <button
                ref={yearTrigger}
                type="button"
                aria-label={`Choose year, ${month.getFullYear()}`}
                onClick={() => show("years")}
              >
                {month.getFullYear()}
                <ChevronDownIcon size={14} />
              </button>
            </div>
          )}
          {view !== "months" ? (
            <div className="a-date-picker__navigation">
              <button
                type="button"
                aria-label={
                  view === "years" ? "Previous 12 years" : "Previous month"
                }
                disabled={previousDisabled}
                onClick={() => move(-1)}
              >
                <ChevronLeftIcon size={20} />
              </button>
              <button
                type="button"
                aria-label={view === "years" ? "Next 12 years" : "Next month"}
                disabled={nextDisabled}
                onClick={() => move(1)}
              >
                <ChevronRightIcon size={20} />
              </button>
            </div>
          ) : null}
        </div>
        <div className="a-date-picker__body">
          <div
            className="a-date-picker__days"
            style={{ visibility: view === "days" ? "visible" : "hidden" }}
            inert={view !== "days"}
            aria-hidden={view !== "days" || undefined}
          >
            <DayPicker
              mode="single"
              required
              autoFocus
              selected={selected}
              month={month}
              onMonthChange={setMonth}
              hideNavigation
              styles={{ month_caption: { display: "none" } }}
              fixedWeeks
              showOutsideDays
              startMonth={first}
              endMonth={last}
              disabled={[
                ...(from ? [{ before: from }] : []),
                ...(until ? [{ after: until }] : []),
              ]}
              onSelect={(day) => {
                if (day) onSelect(iso(day));
              }}
            />
          </div>
          {view !== "days" ? (
            <div className="a-date-picker__selection">
              <div
                ref={choices}
                role="group"
                aria-label={view === "months" ? "Choose month" : "Choose year"}
                className="a-date-picker__choices"
                onKeyDown={(event) => {
                  const offsets: Record<string, number> = {
                    ArrowRight: 1,
                    ArrowLeft: -1,
                    ArrowDown: 3,
                    ArrowUp: -3,
                  };
                  if (
                    !(event.key in offsets) &&
                    event.key !== "Home" &&
                    event.key !== "End"
                  )
                    return;
                  event.preventDefault();
                  const buttons = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      "button[data-choice]",
                    ),
                  );
                  const current = buttons.indexOf(
                    event.target as HTMLButtonElement,
                  );
                  const direction =
                    event.key === "End" || (offsets[event.key] ?? 1) < 0
                      ? -1
                      : 1;
                  let next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? buttons.length - 1
                        : current + offsets[event.key]!;
                  while (
                    next >= 0 &&
                    next < buttons.length &&
                    buttons[next]?.disabled
                  )
                    next += direction;
                  if (buttons[next] && !buttons[next]!.disabled) {
                    buttons.forEach((button, index) => {
                      button.tabIndex = index === next ? 0 : -1;
                    });
                    buttons[next]!.focus();
                  }
                }}
              >
                {Array.from({ length: 12 }, (_, index) => {
                  const year =
                    view === "years" ? yearStart + index : month.getFullYear();
                  const candidate = new Date(
                    year,
                    view === "months" ? index : month.getMonth(),
                    1,
                  );
                  const disabled =
                    view === "years"
                      ? year < first.getFullYear() || year > last.getFullYear()
                      : monthNumber(candidate) < monthNumber(first) ||
                        monthNumber(candidate) > monthNumber(last);
                  const active =
                    view === "years"
                      ? year === month.getFullYear()
                      : index === month.getMonth();
                  const label =
                    view === "years"
                      ? String(year)
                      : new Intl.DateTimeFormat("en", { month: "long" }).format(
                          candidate,
                        );
                  return (
                    <button
                      key={label}
                      data-choice
                      type="button"
                      aria-label={label}
                      aria-pressed={active}
                      disabled={disabled}
                      tabIndex={active ? 0 : -1}
                      onClick={() => {
                        setMonth(clampMonth(candidate));
                        back();
                      }}
                    >
                      {view === "years"
                        ? label
                        : new Intl.DateTimeFormat("en", {
                            month: "short",
                          }).format(candidate)}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="a-date-picker__back"
                onClick={back}
              >
                Back to calendar
              </button>
            </div>
          ) : null}
        </div>
        <div className="a-date-picker__actions">
          <button
            type="button"
            disabled={Boolean(
              (min && todayValue < min) || (max && todayValue > max),
            )}
            onClick={() => onSelect(todayValue)}
          >
            Today
          </button>
          {!required ? (
            <button type="button" onClick={() => onSelect("")}>
              Clear
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
