import type {
  AtlasReadOnlyToolHandler,
  AtlasToolImplementationBindingAdapter,
  AtlasToolRegistration,
} from "./atlas-tool.types.js";
import { validateAtlasToolManifestV1 } from "./atlas-tool-schema.js";

export type AtlasToolRegistryErrorCode =
  | "INVALID_REGISTRATION"
  | "DUPLICATE_TOOL";

export class AtlasToolRegistryError extends Error {
  override readonly name = "AtlasToolRegistryError";

  constructor(
    readonly code: AtlasToolRegistryErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Immutable, code-owned registry. Tool names have one active contract version
 * per process; upgrades replace the registration rather than creating an
 * ambiguous provider-visible alias.
 */
export class AtlasToolRegistry {
  private readonly registrations: ReadonlyMap<string, AtlasToolRegistration>;
  private readonly ordered: readonly AtlasToolRegistration[];

  constructor(
    input: readonly AtlasToolRegistration[],
    implementationBindings: AtlasToolImplementationBindingAdapter,
  ) {
    if (!Array.isArray(input)) {
      throw new AtlasToolRegistryError(
        "INVALID_REGISTRATION",
        "Atlas tool registrations must be a static array.",
      );
    }
    const byName = new Map<string, AtlasToolRegistration>();
    for (const registration of input) {
      if (
        !registration
        || typeof registration !== "object"
        || typeof registration.handler !== "function"
        || typeof registration.implementationBinding !== "string"
        || (
          registration.status !== "enabled"
          && registration.status !== "disabled"
        )
      ) {
        throw new AtlasToolRegistryError(
          "INVALID_REGISTRATION",
          "Atlas tool registration is malformed.",
        );
      }
      const manifest = validateAtlasToolManifestV1(registration.manifest);
      if (
        registration.implementationBinding !== manifest.implementation.binding
        || !safeVerifyBinding(implementationBindings, {
          manifest,
          implementationBinding: registration.implementationBinding,
          handler: registration.handler,
        })
      ) {
        throw new AtlasToolRegistryError(
          "INVALID_REGISTRATION",
          `Atlas tool ${manifest.name} has no verified capability implementation binding.`,
        );
      }
      if (
        manifest.confirmation.mode !== "none"
        || manifest.stepUp.mode !== "none"
        || manifest.dualControl.mode !== "none"
      ) {
        throw new AtlasToolRegistryError(
          "INVALID_REGISTRATION",
          `Atlas tool ${manifest.name} requires controls unsupported by the read-only executor.`,
        );
      }
      if (byName.has(manifest.name)) {
        throw new AtlasToolRegistryError(
          "DUPLICATE_TOOL",
          `Atlas tool ${manifest.name} is registered more than once.`,
        );
      }
      byName.set(manifest.name, Object.freeze({
        manifest,
        status: registration.status,
        implementationBinding: registration.implementationBinding,
        handler: registration.handler,
      }));
    }
    this.registrations = byName;
    this.ordered = Object.freeze(
      [...byName.values()].sort((left, right) =>
        left.manifest.name.localeCompare(right.manifest.name)
      ),
    );
  }

  get(name: string): AtlasToolRegistration | undefined {
    return this.registrations.get(name);
  }

  list(): readonly AtlasToolRegistration[] {
    return this.ordered;
  }
}

export interface AtlasCapabilityRegistryView {
  hasActionCode(actionCode: string): boolean;
}

export interface AtlasToolCodeBinding {
  readonly actionCode: string;
  readonly implementationBinding: string;
  readonly handler: AtlasReadOnlyToolHandler;
}

/**
 * Narrow bridge to the existing CapabilityRegistry. The canonical action must
 * exist there and the code-owned implementation binding must match by exact
 * handler identity; a matching string alone cannot register executable code.
 */
export class CapabilityRegistryToolImplementationBindingAdapter
implements AtlasToolImplementationBindingAdapter {
  private readonly bindings: ReadonlyMap<string, AtlasToolCodeBinding>;

  constructor(
    private readonly capabilities: AtlasCapabilityRegistryView,
    bindings: readonly AtlasToolCodeBinding[],
  ) {
    const byImplementation = new Map<string, AtlasToolCodeBinding>();
    for (const binding of bindings) {
      if (
        byImplementation.has(binding.implementationBinding)
        || typeof binding.handler !== "function"
      ) {
        throw new AtlasToolRegistryError(
          "INVALID_REGISTRATION",
          "Atlas tool implementation bindings must be unique and executable.",
        );
      }
      byImplementation.set(binding.implementationBinding, binding);
    }
    this.bindings = byImplementation;
  }

  verify(
    input: Parameters<AtlasToolImplementationBindingAdapter["verify"]>[0],
  ): boolean {
    const binding = this.bindings.get(input.implementationBinding);
    return this.capabilities.hasActionCode(input.manifest.actionCode)
      && binding?.actionCode === input.manifest.actionCode
      && binding.implementationBinding === input.manifest.implementation.binding
      && binding.handler === input.handler;
  }
}

function safeVerifyBinding(
  adapter: AtlasToolImplementationBindingAdapter,
  input: Parameters<AtlasToolImplementationBindingAdapter["verify"]>[0],
): boolean {
  try {
    return adapter.verify(input) === true;
  } catch {
    return false;
  }
}
