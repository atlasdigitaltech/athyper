/**
 * ChannelRegistry — Manages channel adapter instances.
 *
 * Adapters are registered during module initialization and looked up
 * by channel code (+ optional provider code) during delivery.
 */

import type { Logger } from "../../../../kernel/logger.js";
import type {
    IChannelAdapter,
    IChannelRegistry,
    ChannelCode,
} from "../domain/types.js";

export class ChannelRegistry implements IChannelRegistry {
    /** Map<channelCode, Map<providerCode, adapter>> */
    private readonly adapters = new Map<string, Map<string, IChannelAdapter>>();

    constructor(private readonly logger: Logger) {}

    register(adapter: IChannelAdapter): void {
        let channelMap = this.adapters.get(adapter.channelCode);
        if (!channelMap) {
            channelMap = new Map();
            this.adapters.set(adapter.channelCode, channelMap);
        }

        if (channelMap.has(adapter.providerCode)) {
            throw new Error(
                `Adapter already registered: ${adapter.channelCode}/${adapter.providerCode}`,
            );
        }

        channelMap.set(adapter.providerCode, adapter);
        this.logger.info(
            { channel: adapter.channelCode, provider: adapter.providerCode },
            "[notify:registry] Adapter registered",
        );
    }

    /**
     * Get an adapter for a channel. If providerCode is specified, returns that specific provider.
     * Otherwise returns the first registered provider for the channel.
     */
    getAdapter(channel: ChannelCode, providerCode?: string): IChannelAdapter | undefined {
        const channelMap = this.adapters.get(channel);
        if (!channelMap || channelMap.size === 0) return undefined;

        if (providerCode) {
            return channelMap.get(providerCode);
        }

        // Return first registered adapter for this channel
        return channelMap.values().next().value;
    }

    /**
     * Get all adapters for a channel, ordered by registration order.
     */
    getAdaptersForChannel(channel: ChannelCode): IChannelAdapter[] {
        const channelMap = this.adapters.get(channel);
        if (!channelMap) return [];
        return Array.from(channelMap.values());
    }

    /**
     * Get health status for all registered adapters.
     */
    async getAllHealthStatuses(): Promise<Record<string, { healthy: boolean }>> {
        const statuses: Record<string, { healthy: boolean }> = {};

        for (const [channel, channelMap] of this.adapters) {
            for (const [provider, adapter] of channelMap) {
                const key = `${channel}/${provider}`;
                try {
                    const health = await adapter.healthCheck();
                    statuses[key] = { healthy: health.healthy };
                } catch {
                    statuses[key] = { healthy: false };
                }
            }
        }

        return statuses;
    }
}
