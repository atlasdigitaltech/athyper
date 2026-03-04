export type ApiClientOptions = {
  baseUrl: string;
  token?: string;
  fetch?: typeof fetch; // allow injection for tests / SSR environments
};

export function createApiClient(opts: ApiClientOptions) {
  const f = opts.fetch ?? fetch;

  return {
    async ping() {
      const res = await f(`${opts.baseUrl}/ping`, {
        headers: opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined
      });
      return res.ok;
    }
  };
}

// Export sub-modules
export * from "./notifications";
export * from "./content";
