/**
 * PreferenceEvaluator — Filter delivery plan by user preferences, suppression lists,
 * and quiet hours.
 *
 * For each recipient × channel, checks:
 * 1. Is the channel enabled for this user + event code?
 * 2. Is the recipient's address on the suppression list?
 * 3. Is it quiet hours for this user? (defers delivery)
 *
 * If no preference record exists, the channel is enabled by default.
 *
 * When a ScopedPreferenceResolver is injected, preferences are resolved
 * using the hierarchy: user > org_unit > tenant > system default.
 */

import type { ScopedPreferenceResolver } from "./ScopedPreferenceResolver.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { NotificationPreferenceRepo } from "../../persistence/NotificationPreferenceRepo.js";
import type { NotificationSuppressionRepo } from "../../persistence/NotificationSuppressionRepo.js";
import type {
  ChannelCode,
  PreferenceFrequency,
  QuietHours,
  EffectivePreference,
} from "../types.js";

export interface PreferenceCheckInput {
  tenantId: string;
  principalId: string;
  eventCode: string;
  channel: ChannelCode;
  recipientAddr: string;
  priority?: string;
}

export interface PreferenceCheckResult {
  allowed: boolean;
  reason?: "preference_disabled" | "suppressed" | "quiet_hours_deferred";
  suppressionReason?: string;
  deferUntil?: Date;
  frequency?: PreferenceFrequency;
}

export class PreferenceEvaluator {
  constructor(
    private readonly preferenceRepo: NotificationPreferenceRepo,
    private readonly suppressionRepo: NotificationSuppressionRepo,
    private readonly logger: Logger,
    private readonly scopedResolver?: ScopedPreferenceResolver,
  ) {}

  /**
   * Check if a notification should be delivered to a recipient on a channel.
   */
  async check(input: PreferenceCheckInput): Promise<PreferenceCheckResult> {
    // 1. Resolve effective preference (scoped or flat)
    const effective = await this.resolvePreference(input);

    if (!effective.isEnabled) {
      this.logger.debug(
        {
          principalId: input.principalId,
          eventCode: input.eventCode,
          channel: input.channel,
          resolvedFrom: effective.resolvedFrom,
        },
        "[notify:preference] Channel disabled by preference",
      );
      return { allowed: false, reason: "preference_disabled" };
    }

    // 2. Check suppression list
    const suppression = await this.suppressionRepo.isSuppressed(
      input.tenantId,
      input.channel,
      input.recipientAddr,
    );

    if (suppression) {
      this.logger.debug(
        {
          channel: input.channel,
          reason: suppression.reason,
        },
        "[notify:preference] Address is suppressed",
      );
      return {
        allowed: false,
        reason: "suppressed",
        suppressionReason: suppression.reason,
      };
    }

    // 3. Check quiet hours (critical priority bypasses)
    if (input.priority !== "critical" && effective.quietHours?.enabled) {
      const qhResult = this.isInQuietHours(effective.quietHours, new Date());
      if (qhResult.inQuietHours && qhResult.endsAt) {
        this.logger.debug(
          {
            principalId: input.principalId,
            channel: input.channel,
            endsAt: qhResult.endsAt.toISOString(),
          },
          "[notify:preference] In quiet hours — deferring delivery",
        );
        return {
          allowed: true,
          reason: "quiet_hours_deferred",
          deferUntil: qhResult.endsAt,
          frequency: effective.frequency,
        };
      }
    }

    return {
      allowed: true,
      frequency: effective.frequency,
    };
  }

  /**
   * Batch check: filter a list of recipients × channels, returning only allowed deliveries.
   */
  async filterAllowed(
    inputs: PreferenceCheckInput[],
  ): Promise<{ input: PreferenceCheckInput; result: PreferenceCheckResult }[]> {
    const results: {
      input: PreferenceCheckInput;
      result: PreferenceCheckResult;
    }[] = [];

    const checks = await Promise.all(
      inputs.map(async (input) => ({
        input,
        result: await this.check(input),
      })),
    );

    for (const check of checks) {
      results.push(check);
    }

    return results;
  }

  // ─── Private Helpers ─────────────────────────────────────────────

  /**
   * Resolve effective preference using scoped hierarchy (if available) or flat repo.
   */
  private async resolvePreference(
    input: PreferenceCheckInput,
  ): Promise<EffectivePreference> {
    if (this.scopedResolver) {
      return this.scopedResolver.resolveEffective(
        input.tenantId,
        input.principalId,
        input.eventCode,
        input.channel,
      );
    }

    // Fallback: flat user-only preference
    const isEnabled = await this.preferenceRepo.isEnabled(
      input.tenantId,
      input.principalId,
      input.eventCode,
      input.channel,
    );

    const prefs = await this.preferenceRepo.getForUserByEvent(
      input.tenantId,
      input.principalId,
      input.eventCode,
    );
    const channelPref = prefs.find((p) => p.channel === input.channel);

    return {
      isEnabled,
      frequency: (channelPref?.frequency as PreferenceFrequency) ?? "immediate",
      quietHours: (channelPref?.quietHours as QuietHours | null) ?? null,
      resolvedFrom: "default",
    };
  }

  /**
   * Determine if the current time falls within the user's quiet hours window.
   * Uses Intl.DateTimeFormat for timezone-aware time conversion.
   */
  isInQuietHours(
    qh: QuietHours,
    now: Date,
  ): { inQuietHours: boolean; endsAt: Date | null } {
    if (!qh.enabled || !qh.start || !qh.end || !qh.timezone) {
      return { inQuietHours: false, endsAt: null };
    }

    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: qh.timezone,
        hour: "numeric",
        minute: "numeric",
        hour12: false,
      }).formatToParts(now);

      const hourPart = parts.find((p) => p.type === "hour");
      const minutePart = parts.find((p) => p.type === "minute");
      if (!hourPart || !minutePart)
        return { inQuietHours: false, endsAt: null };

      const h = parseInt(hourPart.value, 10);
      const m = parseInt(minutePart.value, 10);
      const nowMinutes = h * 60 + m;

      const [startH, startM] = qh.start.split(":").map(Number);
      const [endH, endM] = qh.end.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      let inQuiet: boolean;
      if (startMinutes > endMinutes) {
        inQuiet = nowMinutes >= startMinutes || nowMinutes < endMinutes;
      } else {
        inQuiet = nowMinutes >= startMinutes && nowMinutes < endMinutes;
      }

      if (!inQuiet) return { inQuietHours: false, endsAt: null };

      // Calculate delay until quiet hours end
      let delayMinutes: number;
      if (nowMinutes < endMinutes) {
        delayMinutes = endMinutes - nowMinutes;
      } else {
        delayMinutes = 24 * 60 - nowMinutes + endMinutes;
      }

      const endsAt = new Date(now.getTime() + delayMinutes * 60 * 1000);
      return { inQuietHours: true, endsAt };
    } catch (err) {
      this.logger.warn(
        { error: String(err), timezone: qh.timezone },
        "[notify:preference] Failed to compute quiet hours — allowing delivery",
      );
      return { inQuietHours: false, endsAt: null };
    }
  }
}
