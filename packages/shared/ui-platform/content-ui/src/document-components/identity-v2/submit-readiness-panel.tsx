/**
 * @athyper/content-ui — SubmitReadinessPanel (Phase 4)
 *
 * Inline checklist shown above the Submit button. Replaces the "Resolved at
 * submit" anti-pattern: every required field is checked explicitly, and a
 * Quick-Fix action is offered for each warning so the user can resolve issues
 * inline.
 *
 * Reused for PI / PO / SI / SO / PR. Caller passes an array of ReadinessCheck
 * items; component renders icons, labels, and optional fix actions.
 */
"use client";

import { cn } from "@athyper/platform-theme/utils";

export interface ReadinessCheck {
  id:        string;
  label:     string;
  status:    "pass" | "warn" | "fail" | "info";
  /** Optional detail line under the label. */
  detail?:   string;
  /** Optional sublist of sub-issues (e.g. specific lines failing). */
  subItems?: { id: string; label: string; onFix?: () => void }[];
  /** Optional inline Quick-Fix action. */
  onFix?:    () => void;
  fixLabel?: string;
}

export interface SubmitReadinessPanelProps {
  checks: ReadinessCheck[];
  /** Called when user clicks Submit AND all checks pass. */
  onSubmit?: () => void;
  /** Optional bypass for "force submit with warnings" (off by default). */
  allowSubmitWithWarnings?: boolean;
  className?: string;
}

const ICON: Record<ReadinessCheck["status"], string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
  info: "ℹ",
};

const ICON_PALETTE: Record<ReadinessCheck["status"], string> = {
  pass: "text-emerald-600",
  warn: "text-amber-600",
  fail: "text-rose-600",
  info: "text-sky-600",
};

export function SubmitReadinessPanel(props: SubmitReadinessPanelProps) {
  const { checks, onSubmit, allowSubmitWithWarnings = false, className } = props;

  const totalsByStatus = checks.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1; return acc;
  }, {});
  const passCount = totalsByStatus["pass"] ?? 0;
  const warnCount = totalsByStatus["warn"] ?? 0;
  const failCount = totalsByStatus["fail"] ?? 0;
  const canSubmit = failCount === 0 && (warnCount === 0 || allowSubmitWithWarnings);

  return (
    <section
      data-testid="submit-readiness-panel"
      className={cn(
        "rounded-lg border border-slate-200 bg-white shadow-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">Submit readiness</h3>
        <span className="text-xs text-slate-500">
          <span className="text-emerald-600 font-semibold">{passCount} pass</span>
          {warnCount > 0 && <> · <span className="text-amber-700 font-semibold">{warnCount} warn</span></>}
          {failCount > 0 && <> · <span className="text-rose-700 font-semibold">{failCount} fail</span></>}
        </span>
      </header>

      <ul className="px-4 py-3 flex flex-col gap-2">
        {checks.map(check => (
          <li key={check.id} className="flex items-start gap-2 text-xs">
            <span className={cn("font-bold text-base leading-none", ICON_PALETTE[check.status])}>
              {ICON[check.status]}
            </span>
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-baseline gap-2">
                <span className="text-slate-700 font-medium">{check.label}</span>
                {check.onFix && check.status !== "pass" && (
                  <button
                    type="button"
                    onClick={check.onFix}
                    className="text-[10px] font-semibold text-sky-600 hover:text-sky-800 underline"
                  >
                    {check.fixLabel ?? "Fix"}
                  </button>
                )}
              </div>
              {check.detail && (
                <span className="text-slate-500 leading-snug">{check.detail}</span>
              )}
              {check.subItems && check.subItems.length > 0 && (
                <ul className="mt-1 ml-3 list-disc list-inside text-slate-500 flex flex-col gap-0.5">
                  {check.subItems.map(s => (
                    <li key={s.id} className="flex items-baseline gap-2">
                      <span className="truncate">{s.label}</span>
                      {s.onFix && (
                        <button
                          type="button"
                          onClick={s.onFix}
                          className="text-[10px] font-semibold text-sky-600 hover:text-sky-800 underline"
                        >
                          Fix
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>

      <footer className="px-4 py-3 border-t border-slate-200 flex items-center justify-end gap-3">
        {!canSubmit && (
          <span className="text-xs text-slate-500 italic">
            {failCount > 0 ? `Resolve ${failCount} failure${failCount === 1 ? "" : "s"} before submitting.`
                           : `Resolve ${warnCount} warning${warnCount === 1 ? "" : "s"} or allow override.`}
          </span>
        )}
        {onSubmit && (
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onSubmit}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-semibold",
              canSubmit
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "bg-slate-200 text-slate-400 cursor-not-allowed",
            )}
          >
            Submit
          </button>
        )}
      </footer>
    </section>
  );
}
