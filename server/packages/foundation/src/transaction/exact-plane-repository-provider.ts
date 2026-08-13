import type { PlaneKey } from "../context/execution-context.js";

export type PlaneRepositoryRegistry<Repository> = Readonly<Partial<Record<PlaneKey, Repository>>>;

export interface PlaneRepositoryHealth {
  readonly status: "healthy" | "unhealthy" | "unavailable";
  readonly message?: string;
}

export interface ExactPlaneRepositoryProvider<Repository> {
  require(planeKey: PlaneKey): Repository;
  health(planeKey: PlaneKey, signal?: AbortSignal): Promise<PlaneRepositoryHealth>;
}

export interface ExactPlaneRepositoryProviderOptions<Repository> {
  readonly health?: Readonly<Partial<Record<PlaneKey, (repository: Repository, signal?: AbortSignal) => Promise<PlaneRepositoryHealth>>>>;
  readonly unavailableCode?: string;
}

/**
 * Captures an immutable plane-to-repository registry. A missing plane is an
 * error; selection never falls through to a repository registered elsewhere.
 */
export function createExactPlaneRepositoryProvider<Repository>(
  registry: PlaneRepositoryRegistry<Repository>,
  options: ExactPlaneRepositoryProviderOptions<Repository> = {},
): ExactPlaneRepositoryProvider<Repository> {
  const repositories = Object.freeze({ ...registry });
  const probes = Object.freeze({ ...options.health });
  const unavailableCode = options.unavailableCode ?? "EXACT_PLANE_REPOSITORY_UNAVAILABLE";

  return Object.freeze({
    require(planeKey: PlaneKey): Repository {
      const repository = repositories[planeKey];
      if (repository === undefined) throw unavailable(unavailableCode, planeKey);
      return repository;
    },
    async health(planeKey: PlaneKey, signal?: AbortSignal): Promise<PlaneRepositoryHealth> {
      signal?.throwIfAborted();
      const repository = repositories[planeKey];
      if (repository === undefined) return { status: "unavailable", message: `${unavailableCode}:${planeKey}` };
      const probe = probes[planeKey];
      if (!probe) return { status: "healthy" };
      try {
        const result = await probe(repository, signal);
        signal?.throwIfAborted();
        return result;
      } catch (error) {
        signal?.throwIfAborted();
        return { status: "unhealthy", message: error instanceof Error ? error.message : "Repository health probe failed" };
      }
    },
  });
}

function unavailable(code: string, planeKey: PlaneKey): Error {
  return Object.assign(new Error(`${code}:${planeKey}`), { code, planeKey, status: 503 });
}
