import type { Application, RequestHandler, Response } from "express";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { MasterDataError } from "../../errors.js";
import type { createPartnerClassificationService } from "./service.js";

/** Tenant/partner facts: never accept company, organization or commercial role input. */
export function registerPartnerClassificationRoutes(
  app: Application,
  options: {
    authenticate: RequestHandler;
    readContext(response: Response): VerifiedRequestContext;
    service: ReturnType<typeof createPartnerClassificationService>;
  },
) {
  const route =
    (
      work: (
        request: Parameters<RequestHandler>[0],
        response: Response,
      ) => Promise<unknown>,
    ): RequestHandler =>
    async (request, response, next) => {
      response.setHeader("Cache-Control", "private, no-store");
      try {
        response.json(await work(request, response));
      } catch (error) {
        if (error instanceof MasterDataError)
          response
            .status(error.status)
            .json({ code: error.code, message: error.message });
        else next(error);
      }
    };
  const path =
    "/api/neon/business-partners/:businessPartnerId/commodity-classifications";
  app.get(
    path,
    options.authenticate,
    route((request, response) => {
      if (
        Object.keys(request.query).some(
          (k) => !["limit", "cursor", "asOf"].includes(k),
        ) ||
        Object.values(request.query).some((v) => typeof v !== "string")
      )
        throw new MasterDataError(
          400,
          "BP_CLASSIFICATION_INPUT_INVALID",
          "Only scalar pagination and effective-date filters are supported",
        );
      return options.service.read({
        context: options.readContext(response),
        businessPartnerId: String(request.params.businessPartnerId),
        ...(request.query.limit ? { limit: Number(request.query.limit) } : {}),
        ...(request.query.cursor
          ? { cursor: String(request.query.cursor) }
          : {}),
        ...(request.query.asOf ? { asOf: String(request.query.asOf) } : {}),
      });
    }),
  );
  for (const action of ["declare", "verify", "archive"] as const)
    app.post(
      `${path}/${action}`,
      options.authenticate,
      route((request, response) => {
        if (
          !request.body ||
          typeof request.body !== "object" ||
          Array.isArray(request.body)
        )
          throw new MasterDataError(
            400,
            "BP_CLASSIFICATION_INPUT_INVALID",
            "Command object required",
          );
        return options.service.execute({
          context: options.readContext(response),
          businessPartnerId: String(request.params.businessPartnerId),
          action,
          body: request.body,
        });
      }),
    );
}
