import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  compileGraph,
  validateGraph,
  runContractTests,
} from "../deterministic.js";
import { notificationPublicationDescriptor } from "../notification-publication.js";
const load = (file: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../../../../../../tooling/fixtures/notifications/${file}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as MetaEntityGraph;
it.each(["business-partner-inherit", "employee-disabled"])(
  "validates, tests and compiles %s through normal authoring",
  (file) => {
    const g = load(file);
    expect(validateGraph(g).issues).toEqual([]);
    expect(runContractTests(g).passed).toBe(true);
    const compiled = compileGraph(g);
    expect(compiled.descriptor.notificationPolicies).toBeDefined();
    expect(notificationPublicationDescriptor(g)).toMatchObject({
      schema: "athyper.entity-notifications/1",
      sourceEntityCode: g.entity.entityCode,
      entityCode: g.capabilities![0]!.binding!.notifications!.targetEntityCode,
    });
    expect(compileGraph(structuredClone(g)).descriptorHash).toBe(
      compiled.descriptorHash,
    );
  },
);
it("never treats domain fields or runtime operations as a notification-only release", () => {
  const g = load("business-partner-inherit");
  expect(
    notificationPublicationDescriptor({
      ...g,
      fields: [
        { fieldKey: "id", dataType: "uuid", typeConfig: { kind: "uuid" } },
      ],
    }),
  ).toBeNull();
  expect(
    notificationPublicationDescriptor({ ...g, runtimeProfiles: [] }),
  ).toBeNull();
  expect(
    notificationPublicationDescriptor({ ...g, capabilities: [] }),
  ).toBeNull();
});
it("requires a configuration identity and one explicit domain target", () => {
  const g = load("business-partner-inherit");
  expect(
    notificationPublicationDescriptor({
      ...g,
      entity: { ...g.entity, entityClass: "business" },
    }),
  ).toBeNull();
  const changed = structuredClone(g) as any;
  changed.capabilities[1].binding.notifications.targetEntityCode =
    "different_entity";
  expect(() => notificationPublicationDescriptor(changed)).toThrow(
    /target mismatch/,
  );
});
