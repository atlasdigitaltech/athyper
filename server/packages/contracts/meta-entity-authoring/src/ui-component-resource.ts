import {
  FoundationContractError,
  validateFoundationNode,
} from "./foundation-contract.js";
import {
  uiComponentColumns,
  type UiComponentContract,
} from "./ui-component-contract.js";

/** Reviewed source excludes projection hashes and lifecycle state. In particular,
 * a release cannot include its own hash in the bytes being hashed. */
export type UiComponentDeclaration = Omit<
  UiComponentContract,
  "manifestHash" | "publicationReleaseHash" | "status"
>;
export interface UiComponentResourceSource {
  readonly schema: "entity.ui-component-resource/1";
  readonly declaration: UiComponentDeclaration;
  readonly implementation: {
    readonly packageName: string;
    readonly exportName: string;
    readonly sourceHash: string;
    readonly runtimeKey: string;
  };
}
const text = { type: "string", minLength: 1, maxLength: 127 } as const;
export const uiComponentResourceNode = {
  type: "object",
  properties: {
    schema: { const: "entity.ui-component-resource/1" },
    declaration: {
      type: "object",
      properties: Object.fromEntries(
        Object.entries(uiComponentColumns)
          .filter(
            ([key]) =>
              !["manifestHash", "publicationReleaseHash", "status"].includes(
                key,
              ),
          )
          .map(([key, column]) => [key, column.node]),
      ),
    },
    implementation: {
      type: "object",
      properties: {
        packageName: text,
        exportName: text,
        runtimeKey: text,
        sourceHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
      },
    },
  },
} as const;
export function parseUiComponentResourceSource(
  value: unknown,
): UiComponentResourceSource {
  validateFoundationNode(uiComponentResourceNode, value, "/componentResource");
  const source = value as UiComponentResourceSource;
  for (const [key, values] of Object.entries(source.declaration))
    if (Array.isArray(values) && new Set(values).size !== values.length)
      throw new FoundationContractError(
        "UI_COMPONENT_SET_INVALID",
        "/componentResource/declaration/" + key,
      );
  if (
    !source.declaration.supportedPlanes.length ||
    !source.declaration.supportedSurfaceKinds.length
  )
    throw new FoundationContractError(
      "UI_COMPONENT_APPLICABILITY_REQUIRED",
      "/componentResource/declaration",
    );
  return structuredClone(source);
}
