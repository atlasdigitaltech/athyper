import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ProcessSelectionPreview } from "@athyper/server-contract-governance";
import type { Application, RequestHandler, Response } from "express";
import {
  defineRouteContract,
  registerContractRoute,
} from "@athyper/server-runtime-http";

/** Case/domain owner supplies authorized saved facts. No client fact/config payload is accepted. */
export function registerProcessSelectionPreviewRoutes<T>(
  application: Application,
  options: {
    readonly authenticate: RequestHandler;
    readonly readContext: (response: Response) => VerifiedRequestContext;
    readonly transactions: {
      run<R>(
        plane: VerifiedRequestContext["planeKey"],
        actor: { tenantId: string; principalId: string },
        work: (tx: T) => Promise<R>,
      ): Promise<R>;
    };
    readonly service: {
      preview(
        context: VerifiedRequestContext,
        caseId: string,
        tx: T,
      ): Promise<ProcessSelectionPreview>;
    };
  },
) {
  registerContractRoute(
    application,
    defineRouteContract({
      method: "get",
      path: "/api/governance/process-selection/cases/:caseId/preview",
      operationId: "governance.process_selection.preview",
      summary: "Preview the process for an authorized saved case",
      tags: ["Governance"],
      authenticated: true,
      responses: {
        200: {
          description: "Authorized saved-case process preview",
          body: { type: "object", additionalProperties: true },
        },
        400: { description: "Invalid input" },
        401: { description: "Authentication required" },
        403: { description: "Forbidden" },
      },
    }),
    options.authenticate,
    async (request, response, next) => {
      try {
        const caseId = request.params["caseId"];
        if (
          typeof caseId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            caseId,
          ) ||
          Object.keys(request.query).length ||
          (request.body && Object.keys(request.body).length)
        ) {
          response.status(400).json({ code: "PROCESS_PREVIEW_INPUT_INVALID" });
          return;
        }
        const context = options.readContext(response);
        const result = await options.transactions.run(
          context.planeKey,
          { tenantId: context.tenantId, principalId: context.principalId },
          (tx) => options.service.preview(context, caseId, tx),
        );
        response.setHeader("Cache-Control", "no-store");
        response.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );
}
