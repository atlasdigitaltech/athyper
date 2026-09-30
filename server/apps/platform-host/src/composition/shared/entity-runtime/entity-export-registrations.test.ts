import { expect, it, vi } from "vitest";
import { createEntityAuthorizationRuntimeRegistry } from "@athyper/server-contract-metadata";
import {
  buildSharedReferenceGraph,
  compileGraph,
} from "@athyper/server-plane-studio-meta-entity-authoring";
import { createEntityAuthorizationRegistrations } from "./read-registrations.js";

it("qualifies export only with an installed transfer callable and fixed collection semantics", async () => {
  const d = compileGraph(
    buildSharedReferenceGraph(
      {
        entityCode: "export_probe",
        title: "Probe",
        storageObject: "country",
        codeField: "code",
        titleField: "code",
        fields: [
          { key: "id", label: "ID", type: "uuid", required: true },
          { key: "code", label: "Code", type: "string" },
        ],
        columns: ["code"],
        searchFields: ["code"],
        sections: [{ key: "main", label: "Main", fields: ["code"] }],
        runtimeBindings: [
          {
            operation: "list",
            handler: "entity.record.list.v1",
            resolver: "tenant.record.v1",
          },
          {
            operation: "read",
            handler: "entity.record.read.v1",
            resolver: "tenant.record.v1",
          },
        ],
      },
      "neon",
    ),
  ).descriptor;
  const profile = JSON.parse(JSON.stringify(d.authorization));
  profile.operations.push({ ...profile.operations[0], key: "export" });
  const runtime = JSON.parse(JSON.stringify(d.authorizationRuntime));
  runtime.bindings.push({
    operation: "export",
    handler: "entity.record.export.v1",
    resolver: "tenant.record.v1",
  });
  const queries = { list: vi.fn(), get: vi.fn() },
    transfers = { requestExport: vi.fn() };
  const absent = createEntityAuthorizationRuntimeRegistry(
    createEntityAuthorizationRegistrations(queries, profile),
  );
  expect(() => absent.qualify(profile, runtime)).toThrow();
  const entries = createEntityAuthorizationRegistrations(
    queries,
    profile,
    undefined,
    transfers,
  );
  expect(() =>
    createEntityAuthorizationRuntimeRegistry(entries).qualify(profile, runtime),
  ).not.toThrow();
  await entries.find((e) => e.operation.key === "export")!.handler.invoke();
  expect(transfers.requestExport).toHaveBeenCalledOnce();
  const changed = structuredClone(profile);
  changed.operations.find((o: { key: string }) => o.key === "export").effect =
    "write";
  expect(() =>
    createEntityAuthorizationRuntimeRegistry(entries).qualify(changed, runtime),
  ).toThrow();
});
