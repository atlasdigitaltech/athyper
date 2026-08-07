import {
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

export type AtlasSpanName =
  | "atlas.agent.run"
  | "atlas.catalog.resolve"
  | "atlas.provider.invoke"
  | "atlas.conversation.prepare"
  | "atlas.conversation.finalize";

/**
 * Closed, content-free span attributes. Prompts, responses, record values,
 * provider bodies, tenant IDs, principal IDs, and credentials have no field
 * in this contract and therefore cannot be attached accidentally.
 */
export interface AtlasSpanAttributes {
  plane?: "neon" | "mesh" | "admin" | "unknown";
  publicModel?: string;
  provider?: string;
  bindingId?: string;
  adapterId?: string;
  persistenceEnabled?: boolean;
  toolExecutionEnabled?: boolean;
  outcome?: string;
  errorClass?: string;
  providerRound?: number;
}

const tracer = trace.getTracer("@athyper/svc-ai", "1.0.0");

export function startAtlasSpan(
  name: AtlasSpanName,
  attributes: AtlasSpanAttributes = {},
): Span {
  return tracer.startSpan(name, {
    attributes: toSafeAtlasSpanAttributes(attributes),
  });
}

export async function withAtlasSpan<T>(
  name: AtlasSpanName,
  attributes: AtlasSpanAttributes,
  operation: () => Promise<T>,
): Promise<T> {
  const span = startAtlasSpan(name, attributes);
  try {
    const result = await operation();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}

export async function* traceAtlasStream<T>(
  name: Extract<AtlasSpanName, "atlas.agent.run" | "atlas.provider.invoke">,
  attributes: AtlasSpanAttributes,
  stream: AsyncIterable<T>,
): AsyncIterable<T> {
  const span = startAtlasSpan(name, attributes);
  try {
    for await (const item of stream) yield item;
    span.setStatus({ code: SpanStatusCode.OK });
  } catch (error) {
    span.setStatus({ code: SpanStatusCode.ERROR });
    throw error;
  } finally {
    span.end();
  }
}

export const ATLAS_SPAN_ATTRIBUTE_KEYS = Object.freeze([
  "atlas.plane",
  "atlas.public_model",
  "atlas.provider",
  "atlas.binding_id",
  "atlas.adapter_id",
  "atlas.persistence_enabled",
  "atlas.tool_execution_enabled",
  "atlas.outcome",
  "atlas.error_class",
  "atlas.provider_round",
] as const);

export function toSafeAtlasSpanAttributes(
  input: AtlasSpanAttributes,
): Attributes {
  return {
    ...(input.plane ? { "atlas.plane": input.plane } : {}),
    ...(input.publicModel
      ? { "atlas.public_model": bounded(input.publicModel, 80) }
      : {}),
    ...(input.provider
      ? { "atlas.provider": bounded(input.provider, 40) }
      : {}),
    ...(input.bindingId
      ? { "atlas.binding_id": bounded(input.bindingId, 120) }
      : {}),
    ...(input.adapterId
      ? { "atlas.adapter_id": bounded(input.adapterId, 120) }
      : {}),
    ...(input.persistenceEnabled !== undefined
      ? { "atlas.persistence_enabled": input.persistenceEnabled }
      : {}),
    ...(input.toolExecutionEnabled !== undefined
      ? { "atlas.tool_execution_enabled": input.toolExecutionEnabled }
      : {}),
    ...(input.outcome
      ? { "atlas.outcome": bounded(input.outcome, 40) }
      : {}),
    ...(input.errorClass
      ? { "atlas.error_class": bounded(input.errorClass, 60) }
      : {}),
    ...(input.providerRound !== undefined
      ? { "atlas.provider_round": input.providerRound }
      : {}),
  };
}

function bounded(value: string, maximum: number): string {
  return value.trim().slice(0, maximum);
}
