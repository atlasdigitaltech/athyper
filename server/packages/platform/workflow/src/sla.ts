export interface SlaPolicy { readonly code: string; readonly version: number; readonly durationMinutes: number; readonly reminderMinutes?: readonly number[]; readonly escalationMinutes?: number; }
export interface SlaSchedule { readonly policyCode: string; readonly policyVersion: number; readonly dueAt: string; readonly remindersAt: readonly string[]; readonly escalateAt?: string; }
export function scheduleSla(policy: SlaPolicy, startedAt: Date): SlaSchedule {
  if(!Number.isInteger(policy.version)||policy.version<1||!Number.isFinite(policy.durationMinutes)||policy.durationMinutes<=0)throw new TypeError("SLA policy requires a positive version and duration");
  if(policy.reminderMinutes?.some(value=>!Number.isFinite(value)||value<0)||policy.escalationMinutes!==undefined&&(!Number.isFinite(policy.escalationMinutes)||policy.escalationMinutes<0))throw new TypeError("SLA reminder and escalation minutes must be non-negative");
  const at = (minutes: number) => new Date(startedAt.getTime() + minutes * 60_000).toISOString();
  return { policyCode: policy.code, policyVersion: policy.version, dueAt: at(policy.durationMinutes), remindersAt: [...new Set(policy.reminderMinutes ?? [])].filter((minute) => minute < policy.durationMinutes).sort((a,b)=>a-b).map(at), ...(policy.escalationMinutes!==undefined ? { escalateAt: at(policy.escalationMinutes) } : {}) };
}
