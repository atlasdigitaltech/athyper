import { expect, it, vi } from "vitest";
import { createContainer } from "../../../kernel/container.js";
import {
  registerEntitySupportQualification,
  type EntitySupportQualificationRegistration,
} from "./support-qualification.js";

function registration() {
  return {
    storage: { get: vi.fn(), putIfAbsent: vi.fn() },
    authority: {
      authorize: vi.fn(),
      actor: vi.fn(),
      current: vi.fn(),
      compareAndSwap: vi.fn(),
    },
    probe: vi.fn(),
    validityMs: 60_000,
  } as EntitySupportQualificationRegistration;
}

it("requires explicit custody composition and never borrows the publication credential", () => {
  const container = createContainer();
  container.adapters.objectStorageArtifacts = {} as never;
  registerEntitySupportQualification(container, undefined);
  expect(container.platform.entitySupportQualification).toBeUndefined();
  expect(() =>
    registerEntitySupportQualification(container, registration()),
  ).toThrow("ENTITY_QUALIFICATION_HOST_UNAVAILABLE");
});

it("retains the verified subject when resolving the current published descriptor", async () => {
  const container = createContainer(),
    context = { planeKey: "neon" } as never;
  const read = vi.fn(async () => null);
  container.platform.metadata = { getEntityDescriptor: read } as never;
  container.platform.entityReadiness = { describeDescriptor: vi.fn() } as never;
  const custody = registration();
  registerEntitySupportQualification(container, custody);
  await expect(
    container.platform.entitySupportQualification!.qualify({
      subject: context,
      entityCode: "example",
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("ENTITY_QUALIFICATION_DESCRIPTOR_UNAVAILABLE");
  expect(read).toHaveBeenCalledWith(context, "example");
  expect(custody.probe).not.toHaveBeenCalled();
  expect(custody.storage.putIfAbsent).not.toHaveBeenCalled();
});

it("rejects a descriptor from another plane before custody or execution", async () => {
  const container = createContainer();
  container.platform.metadata = {
    getEntityDescriptor: async () => ({
      entityCode: "example",
      planeKey: "studio",
    }),
  } as never;
  container.platform.entityReadiness = { describeDescriptor: vi.fn() } as never;
  const custody = registration();
  registerEntitySupportQualification(container, custody);
  await expect(
    container.platform.entitySupportQualification!.qualify({
      subject: { planeKey: "neon" } as never,
      entityCode: "example",
      signal: new AbortController().signal,
    }),
  ).rejects.toThrow("ENTITY_QUALIFICATION_DESCRIPTOR_UNAVAILABLE");
  expect(custody.authority.authorize).not.toHaveBeenCalled();
  expect(custody.storage.putIfAbsent).not.toHaveBeenCalled();
});
