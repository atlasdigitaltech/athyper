import parser from "cron-parser";
import type { CronPreview } from "@athyper/server-contract-jobs";

const MAX_PREVIEW = 20;

export function previewCron(input: {
  readonly expression: string;
  readonly timezone: string;
  readonly count?: number;
  readonly from?: string;
}): CronPreview {
  const expression = input.expression.trim();
  const timezone = input.timezone.trim();
  if (!expression) throw new TypeError("cron expression is required");
  if (!timezone || timezone.length > 64) throw new TypeError("timezone is invalid");
  const count = Math.max(1, Math.min(MAX_PREVIEW, Math.trunc(input.count ?? 5)));
  const currentDate = input.from ? validDate(input.from) : new Date();
  try {
    const interval = parser.parseExpression(expression, { currentDate, tz: timezone });
    return {
      expression,
      timezone,
      nextRuns: Array.from({ length: count }, () => interval.next().toDate().toISOString()),
    };
  } catch (error) {
    throw new TypeError(`Invalid cron schedule: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validDate(value: string): Date {
  const result = new Date(value);
  if (Number.isNaN(result.valueOf())) throw new TypeError("from must be an ISO date-time");
  return result;
}
