/**
 * Orchestration Runtime — execute integration flow steps in sequence/parallel.
 */

import { randomUUID } from "node:crypto";

import type { MappingEngine, MappingSpec } from "./MappingEngine.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { HttpConnectorClient } from "../../connectors/http/HttpConnectorClient.js";
import type { IntegrationMetrics } from "../../observability/metrics.js";
import type { EndpointRepo } from "../../persistence/EndpointRepo.js";
import type { JobLogRepo } from "../../persistence/JobLogRepo.js";
import type { IntegrationFlow, FlowStep } from "../models/IntegrationFlow.js";

export interface FlowRunResult {
  runId: string;
  status: "completed" | "failed" | "partial";
  steps: StepResult[];
  totalDurationMs: number;
}

export interface StepResult {
  stepIndex: number;
  stepName: string;
  status: "completed" | "failed" | "skipped";
  output?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

interface FlowRunContext {
  runId: string;
  tenantId: string;
  flowId: string;
  createdBy: string;
  stepResults: Map<number, Record<string, unknown>>;
  currentInput: Record<string, unknown>;
}

export class OrchestrationRuntime {
  constructor(
    private readonly httpClient: HttpConnectorClient,
    private readonly endpointRepo: EndpointRepo,
    private readonly mappingEngine: MappingEngine,
    private readonly jobLogRepo: JobLogRepo,
    private readonly metrics: IntegrationMetrics | null,
    private readonly logger: Logger,
  ) {}

  async executeFlow(
    flow: IntegrationFlow,
    input: Record<string, unknown>,
    tenantId: string,
    createdBy: string,
  ): Promise<FlowRunResult> {
    const runId = randomUUID();
    const totalStart = Date.now();

    this.logger.info(
      { tenantId, flowId: flow.id, flowCode: flow.code, runId },
      "[int:orchestration] Starting flow execution",
    );

    this.metrics?.flowExecutionStarted({ tenant: tenantId, flow: flow.code });

    const ctx: FlowRunContext = {
      runId,
      tenantId,
      flowId: flow.id,
      createdBy,
      stepResults: new Map(),
      currentInput: input,
    };

    const stepResults: StepResult[] = [];
    let overallStatus: "completed" | "failed" | "partial" = "completed";

    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const stepStart = Date.now();

      const { id: logId } = await this.jobLogRepo.startStep({
        tenantId,
        flowId: flow.id,
        runId,
        stepIndex: i,
        stepType: step.type,
        input: ctx.currentInput,
      });

      try {
        const output = await this.executeStep(step, ctx, i);
        const durationMs = Date.now() - stepStart;

        await this.jobLogRepo.completeStep(logId, output, durationMs);

        ctx.stepResults.set(i, output);
        ctx.currentInput = output;

        stepResults.push({
          stepIndex: i,
          stepName: step.name,
          status: "completed",
          output,
          durationMs,
        });

        this.metrics?.flowStepDuration(durationMs, {
          tenant: tenantId,
          flow: flow.code,
          stepType: step.type,
        });
      } catch (err) {
        const durationMs = Date.now() - stepStart;
        const errorMsg = err instanceof Error ? err.message : String(err);

        await this.jobLogRepo.failStep(logId, errorMsg, durationMs);

        stepResults.push({
          stepIndex: i,
          stepName: step.name,
          status: "failed",
          error: errorMsg,
          durationMs,
        });

        const errorAction = step.onError ?? "stop";

        if (errorAction === "stop") {
          overallStatus = "failed";
          for (let j = i + 1; j < flow.steps.length; j++) {
            stepResults.push({
              stepIndex: j,
              stepName: flow.steps[j].name,
              status: "skipped",
              durationMs: 0,
            });
          }
          break;
        } else if (errorAction === "skip") {
          overallStatus = "partial";
          continue;
        } else if (errorAction === "retry") {
          try {
            const retryOutput = await this.executeStep(step, ctx, i);
            const retryDurationMs = Date.now() - stepStart;
            await this.jobLogRepo.completeStep(
              logId,
              retryOutput,
              retryDurationMs,
            );
            ctx.stepResults.set(i, retryOutput);
            ctx.currentInput = retryOutput;
            stepResults[stepResults.length - 1] = {
              stepIndex: i,
              stepName: step.name,
              status: "completed",
              output: retryOutput,
              durationMs: retryDurationMs,
            };
          } catch {
            overallStatus = "failed";
            break;
          }
        }
      }
    }

    const totalDurationMs = Date.now() - totalStart;
    this.metrics?.flowExecutionCompleted({
      tenant: tenantId,
      flow: flow.code,
      status: overallStatus,
    });

    this.logger.info(
      {
        tenantId,
        flowId: flow.id,
        runId,
        status: overallStatus,
        totalDurationMs,
      },
      "[int:orchestration] Flow execution complete",
    );

    return {
      runId,
      status: overallStatus,
      steps: stepResults,
      totalDurationMs,
    };
  }

  private async executeStep(
    step: FlowStep,
    ctx: FlowRunContext,
    stepIndex: number,
  ): Promise<Record<string, unknown>> {
    switch (step.type) {
      case "HTTP_CALL":
        return this.executeHttpCall(step, ctx);
      case "TRANSFORM":
        return this.executeTransform(step, ctx);
      case "CONDITION":
        return this.executeCondition(step, ctx);
      case "DELAY":
        return this.executeDelay(step);
      case "PARALLEL":
        return this.executeParallel(step, ctx, stepIndex);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private async executeHttpCall(
    step: FlowStep,
    ctx: FlowRunContext,
  ): Promise<Record<string, unknown>> {
    const endpointCode = step.config.endpointCode as string;
    const endpoint = await this.endpointRepo.getByCode(
      ctx.tenantId,
      endpointCode,
    );
    if (!endpoint) throw new Error(`Endpoint not found: ${endpointCode}`);

    const body = step.config.body ?? ctx.currentInput;
    const headers = (step.config.headers as Record<string, string>) ?? {};
    const queryParams =
      (step.config.queryParams as Record<string, string>) ?? {};

    const response = await this.httpClient.execute(endpoint, {
      body,
      headers,
      queryParams,
    });

    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
      durationMs: response.durationMs,
    };
  }

  private async executeTransform(
    step: FlowStep,
    ctx: FlowRunContext,
  ): Promise<Record<string, unknown>> {
    const mapping = step.config.mapping as MappingSpec;
    if (!mapping)
      throw new Error("TRANSFORM step requires 'mapping' in config");
    return this.mappingEngine.transform(ctx.currentInput, mapping);
  }

  private async executeCondition(
    step: FlowStep,
    ctx: FlowRunContext,
  ): Promise<Record<string, unknown>> {
    const field = step.config.field as string;
    const operator = step.config.operator as string;
    const value = step.config.value;

    const fieldValue = this.mappingEngine.getPath(ctx.currentInput, field);
    let result = false;

    switch (operator) {
      case "eq":
        result = fieldValue === value;
        break;
      case "neq":
        result = fieldValue !== value;
        break;
      case "gt":
        result = (fieldValue as number) > (value as number);
        break;
      case "gte":
        result = (fieldValue as number) >= (value as number);
        break;
      case "lt":
        result = (fieldValue as number) < (value as number);
        break;
      case "lte":
        result = (fieldValue as number) <= (value as number);
        break;
      case "contains":
        result = String(fieldValue).includes(String(value));
        break;
      case "exists":
        result = fieldValue !== undefined && fieldValue !== null;
        break;
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }

    return {
      condition: result,
      field,
      operator,
      fieldValue,
      expectedValue: value,
    };
  }

  private async executeDelay(step: FlowStep): Promise<Record<string, unknown>> {
    const delayMs = (step.config.delayMs as number) ?? 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { delayed: true, delayMs };
  }

  private async executeParallel(
    step: FlowStep,
    ctx: FlowRunContext,
    _stepIndex: number,
  ): Promise<Record<string, unknown>> {
    const subSteps = step.config.steps as FlowStep[];
    if (!subSteps || !Array.isArray(subSteps)) {
      throw new Error("PARALLEL step requires 'steps' array in config");
    }

    const results = await Promise.allSettled(
      subSteps.map((subStep, i) => this.executeStep(subStep, ctx, i)),
    );

    const output: Record<string, unknown> = {};
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "fulfilled") {
        output[`step_${i}`] = result.value;
      } else {
        output[`step_${i}`] = {
          error: result.reason?.message ?? String(result.reason),
        };
      }
    }

    return output;
  }
}
