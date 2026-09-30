import {
  createPublishedSummaryService,
  createEntityRuntimeResourceService,
  createEntityOperationDispatcher,
} from "@athyper/server-platform-experience";

type ResourceOptions = Parameters<typeof createEntityRuntimeResourceService>[0];
export interface EntityResourceOptions extends Omit<
  ResourceOptions,
  "publishedSummary"
> {
  readonly createHandlers: (
    resources: ReturnType<typeof createEntityRuntimeResourceService>,
  ) => Parameters<typeof createEntityOperationDispatcher>[0]["handlers"];
}

/** Resource reads and operation dispatch use the same admitted reader and capability policy. */
export function createEntityResourceServices(options: EntityResourceOptions) {
  const { createHandlers, ...resourceOptions } = options;
  const summaries = createPublishedSummaryService({
    reader: options.reader,
    headers: options.headers,
    providers: options.summaries,
  });
  const resources = createEntityRuntimeResourceService({
    ...resourceOptions,
    publishedSummary: (input, release) => summaries.read(input, release),
  });
  const operations = createEntityOperationDispatcher({
    reader: options.reader,
    capabilities: options.capabilities,
    handlers: createHandlers(resources),
  });
  return { resources, operations, summaries };
}
