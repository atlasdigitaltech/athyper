/**
 * Registry of implemented model adapters.
 *
 * A registry entry is provider/adapter scoped. A request is executable only
 * after an exact AtlasModelBinding resolves to an adapter whose operational
 * state is eligible. This prevents a provider-level lookup from silently
 * invoking a bootstrap default model.
 */

import type {
  AtlasModelBinding,
  IModelProvider,
  ProviderOperationalState,
} from "./i-model-provider.js";

export interface RegisteredProvider {
  providerId: string;
  adapterId: string;
  adapterVersion: string;
  provider: IModelProvider;
  state: ProviderOperationalState;
}

export interface ResolvedModelProvider extends RegisteredProvider {
  binding: AtlasModelBinding;
}

export class ProviderRegistry {
  private readonly byProviderAndAdapter = new Map<string, RegisteredProvider>();

  register(
    providerId: string,
    provider: IModelProvider,
    stateOverride?: ProviderOperationalState,
  ): void {
    const adapterId = provider.adapterId ?? provider.modelId;
    const state = stateOverride ?? provider.operationalState ?? ineligibleState(
      "adapter_did_not_declare_operational_state",
    );
    const normalizedState = normalizeState(provider, state);
    const key = registrationKey(providerId, adapterId);

    if (this.byProviderAndAdapter.has(key)) {
      throw new Error(
        `ProviderRegistry: duplicate provider/adapter registration "${providerId}/${adapterId}"`,
      );
    }

    this.byProviderAndAdapter.set(key, {
      providerId,
      adapterId,
      adapterVersion: provider.adapterVersion ?? provider.modelVersion,
      provider,
      state: normalizedState,
    });
  }

  getByProviderId(providerId: string): IModelProvider | null {
    const registrations = this.listRegistrations()
      .filter((entry) => entry.providerId === providerId);
    if (registrations.length !== 1) return null;
    return registrations[0]?.provider ?? null;
  }

  getRegistration(providerId: string, adapterId: string): RegisteredProvider | null {
    return this.byProviderAndAdapter.get(registrationKey(providerId, adapterId)) ?? null;
  }

  updateOperationalState(
    providerId: string,
    adapterId: string,
    state: ProviderOperationalState,
  ): boolean {
    const key = registrationKey(providerId, adapterId);
    const current = this.byProviderAndAdapter.get(key);
    if (!current) return false;
    this.byProviderAndAdapter.set(key, {
      ...current,
      state: normalizeState(current.provider, state),
    });
    return true;
  }

  resolve(binding: AtlasModelBinding): ResolvedModelProvider | null {
    const registration = this.getRegistration(binding.providerId, binding.adapterId);
    if (!registration || !registration.state.eligible) return null;
    if (registration.adapterVersion !== binding.adapterVersion) return null;
    if (binding.status !== "available" || !binding.capabilities.streaming) return null;

    return { ...registration, binding };
  }

  isBindingEligible(binding: AtlasModelBinding): boolean {
    return this.resolve(binding) !== null;
  }

  hasEligibleBinding(bindings: readonly AtlasModelBinding[]): boolean {
    return bindings.some((binding) => this.isBindingEligible(binding));
  }

  listRegistered(): string[] {
    return Array.from(new Set(
      this.listRegistrations().map((entry) => entry.providerId),
    ));
  }

  listRegistrations(): RegisteredProvider[] {
    return Array.from(this.byProviderAndAdapter.values());
  }
}

function normalizeState(
  provider: IModelProvider,
  state: ProviderOperationalState,
): ProviderOperationalState {
  const streamingImplemented =
    provider.capabilities.supports_streaming
    && typeof provider.invokeStream === "function";
  const eligible =
    state.implemented
    && state.credentialed
    && state.healthy
    && state.eligible
    && streamingImplemented;

  return {
    ...state,
    eligible,
    ...(!eligible && !state.reason
      ? { reason: streamingImplemented ? "adapter_not_operational" : "streaming_not_implemented" }
      : {}),
  };
}

function ineligibleState(reason: string): ProviderOperationalState {
  return {
    implemented: false,
    credentialed: false,
    healthy: false,
    eligible: false,
    reason,
  };
}

function registrationKey(providerId: string, adapterId: string): string {
  return `${providerId}\u0000${adapterId}`;
}
