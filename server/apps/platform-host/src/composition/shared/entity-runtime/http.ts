import {
  registerExperienceRoutes,
  registerEntityRuntimeRoutes,
  registerEntityIntakeOperationRoutes,
} from "@athyper/server-platform-experience";
import { registerEntityActivityRoutes } from "@athyper/server-platform-experience";
import {
  registerRecordsRoutes,
  parseEntityListScopeCoordinate,
} from "@athyper/server-service-records";
import {
  registerEntityReadHttp,
  type EntityReadHttpBindings,
} from "./routes.js";
import type { EntityServices } from "./services.js";

type Application = Parameters<typeof registerEntityReadHttp>[0];
export interface EntityHttpOptions {
  readonly authenticate: EntityReadHttpBindings["entity"]["authenticate"];
  readonly readContext: EntityReadHttpBindings["entity"]["readContext"];
  readonly services: EntityServices;
  readonly savedViews: NonNullable<EntityReadHttpBindings["views"]>["service"];
  readonly referenceHistory: NonNullable<
    EntityReadHttpBindings["references"]
  >["store"];
  readonly referenceDirectory: NonNullable<
    EntityReadHttpBindings["directory"]
  >["directory"];
  readonly authorizer: NonNullable<
    EntityReadHttpBindings["snapshots"]
  >["authorizer"];
  readonly activity: Parameters<
    typeof registerEntityActivityRoutes
  >[1]["service"];
}

/** Separate service construction from route mounting; preserve compatibility registration order. */
export function createEntityHttpRegistrars(options: EntityHttpOptions) {
  const {
    authenticate,
    readContext,
    savedViews,
    referenceHistory,
    referenceDirectory,
    authorizer,
  } = options;
  const { lists, queries, mutations, bookmarks, snapshots } = options.services;
  return {
    activity: (application: Application) =>
      registerEntityActivityRoutes(application, {
        authenticate,
        readContext,
        service: options.activity,
      }),
    read: (application: Application) =>
      registerEntityReadHttp(application, {
        views: {
          authenticate,
          readContext,
          service: savedViews,
          descriptor: (context, entity, query) =>
            lists.descriptor(
              context,
              entity,
              parseEntityListScopeCoordinate(query),
            ),
        },
        references: {
          authenticate,
          readContext,
          descriptor: (context, entity, query) =>
            lists.applicationDescriptor(
              context,
              entity,
              parseEntityListScopeCoordinate(query),
            ),
          store: referenceHistory,
        },
        directory: {
          authenticate,
          readContext,
          directory: referenceDirectory,
        },
        entity: {
          authenticate,
          readContext,
          lists,
          applicationDescriptor: (context, entityCode, scopeCoordinate) => {
            return lists.applicationDescriptor(
              context,
              entityCode,
              scopeCoordinate,
            );
          },
        },
        bookmarks: {
          authenticate,
          readContext,
          bookmarks,
        },
        ...(snapshots
          ? {
              snapshots: {
                authenticate,
                readContext,
                authorizer,
                snapshots,
              },
            }
          : {}),
      }),
    records: (application: Application) =>
      registerRecordsRoutes(application, {
        authenticate,
        readContext,
        queries,
        mutations,
      }),
  };
}

/** Published resource routes retain the supplied capability policy and callable handlers. */
export function createEntityResourceHttpRegistrar(
  options: Parameters<typeof registerEntityRuntimeRoutes>[1] & {
    readonly intakeProviders: Parameters<
      typeof registerEntityIntakeOperationRoutes
    >[1]["providers"];
  },
) {
  return (application: Application) => {
    registerEntityRuntimeRoutes(application, options);
    registerEntityIntakeOperationRoutes(application, {
      authenticate: options.authenticate,
      readContext: options.readContext,
      providers: options.intakeProviders,
    });
  };
}

export function createEntityExperienceHttpRegistrar(
  options: Parameters<typeof registerExperienceRoutes>[1],
) {
  return (application: Application) =>
    registerExperienceRoutes(application, options);
}
