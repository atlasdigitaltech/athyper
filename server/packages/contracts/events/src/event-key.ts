export interface DurableEventKeyInput {
  readonly tenantId: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly version: string | number;
  readonly eventType: string;
}

export function buildDurableEventKey(input: DurableEventKeyInput): string {
  return [
    input.tenantId,
    input.aggregateType,
    input.aggregateId,
    String(input.version),
    input.eventType,
  ].map((part) => encodeURIComponent(part)).join("/");
}
