import { expect, it, vi } from "vitest";
import { createMetadataFormatReader } from "../shared/entity-runtime/metadata-format-reader.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
const context = {} as VerifiedRequestContext;
it("uses an admitted split release, preserves native-only publications and never falls back on verification errors",async()=>{
  const compiled={getEntityDescriptor:vi.fn()}, native={getEntityDescriptor:vi.fn()};
  const reader=createMetadataFormatReader(compiled,native);
  const descriptor={entityCode:"example_dictionary"};
  compiled.getEntityDescriptor.mockResolvedValue(descriptor);
  expect(await reader.getEntityDescriptor(context,"example_dictionary")).toBe(descriptor);
  expect(native.getEntityDescriptor).not.toHaveBeenCalled();
  compiled.getEntityDescriptor.mockResolvedValue(null);native.getEntityDescriptor.mockResolvedValue(descriptor);
  expect(await reader.getEntityDescriptor(context,"example_dictionary")).toBe(descriptor);
  native.getEntityDescriptor.mockClear();compiled.getEntityDescriptor.mockRejectedValue(Error("invalid signed artifact"));
  await expect(reader.getEntityDescriptor(context,"example_dictionary")).rejects.toThrow("invalid signed artifact");
  expect(native.getEntityDescriptor).not.toHaveBeenCalled();
});
