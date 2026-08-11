export interface SlaPolicy { readonly code: string; readonly version: number; readonly durationMinutes: number; readonly reminderMinutes?: readonly number[]; readonly escalationMinutes?: number; }
export interface SlaSchedule { readonly policyCode: string; readonly policyVersion: number; readonly dueAt: string; readonly remindersAt: readonly string[]; readonly escalateAt?: string; }
export function scheduleSla(policy: SlaPolicy, startedAt: Date): SlaSchedule {
  const at = (minutes: number) => new Date(startedAt.getTime() + minutes * 60_000).toISOString();
  return { policyCode: policy.code, policyVersion: policy.version, dueAt: at(policy.durationMinutes), remindersAt: (policy.reminderMinutes ?? []).filter((minute) => minute < policy.durationMinutes).map(at), ...(policy.escalationMinutes ? { escalateAt: at(policy.escalationMinutes) } : {}) };
}
