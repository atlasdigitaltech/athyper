// framework/runtime/kernel/container.ts
import type { TokenName, TokenValue } from "./tokens";

/**
 * Factory function used to create a dependency instance.
 *
 * - Receives the current Container (scope-aware)
 * - Can be async (DB pools, adapters, remote clients, etc.)
 */
export type Factory<T> = (c: Container) => T | Promise<T>;

type CacheMode = "singleton" | "scoped" | "transient";

/**
 * Internal registration record for a token.
 */
type Registration<T> = {
    factory: Factory<T>;
    cache: CacheMode;
};

export class Container {
    private regs = new Map<string, Registration<any>>();
    private singletons = new Map<string, any>();
    private scoped = new Map<string, any>();

    constructor(private parent?: Container) { }

    /**
     * Check if token is registered in this container or any parent.
     */
    has(token: TokenName | string): boolean {
        return this.regs.has(token) || (this.parent ? this.parent.has(token) : false);
    }

    /**
     * Register a dependency factory for a token.
     *
     * Baseline rules:
     * - Tokens SHOULD come from TOKENS (capability-based)
     * - Registration happens during kernel bootstrap only
     * - Duplicate registrations are considered a bug
     */
    register<T>(
        token: TokenName | string,
        factory: Factory<T>,
        cache: CacheMode = "singleton"
    ) {
        if (this.regs.has(token)) {
            throw new Error(`Token already registered: ${token}`);
        }
        this.regs.set(token, { factory, cache });
    }

    /**
     * Create a child container scope for:
     * - HTTP requests
     * - Background jobs
     * - Scheduled executions
     */
    createScope() {
        return new Container(this);
    }

    /**
     * Resolve overloads:
     * - Known TOKENS => inferred type (TokenValue)
     * - Any string => legacy generic type
     */
    resolve<T extends TokenName>(token: T): Promise<TokenValue<T>>;
    resolve<T>(token: string): Promise<T>;
    async resolve<T>(token: TokenName | string): Promise<T> {
        const reg = this.regs.get(token) ?? this.parent?.getRegistration(token);

        if (!reg) {
            throw new Error(`Missing container token: ${token}`);
        }

        if (reg.cache === "singleton") {
            const root = this.getRoot();
            if (root.singletons.has(token)) return root.singletons.get(token);

            const value = await reg.factory(this);
            root.singletons.set(token, value);
            return value;
        }

        if (reg.cache === "scoped") {
            if (this.scoped.has(token)) return this.scoped.get(token);

            const value = await reg.factory(this);
            this.scoped.set(token, value);
            return value;
        }

        // transient
        return (await reg.factory(this)) as T;
    }

    private getRegistration(token: TokenName | string) {
        return this.regs.get(token);
    }

    private getRoot(): Container {
        return this.parent ? this.parent.getRoot() : this;
    }
}

export function createKernelContainer() {
    return new Container();
}