/**
 * WebRTC Bridge — server-side signaling placeholder.
 * Manages WebRTC session offers/answers for browser-based calling.
 */

import type { Logger } from "../../../../kernel/logger.js";

export interface WebRtcConfig {
    enabled: boolean;
    stunServers: string[];
    turnServerUrl?: string;
    turnCredentialRef?: string;
}

export interface WebRtcSession {
    sessionId: string;
    iceServers: Array<{ urls: string; username?: string; credential?: string }>;
}

export interface IWebRtcBridge {
    readonly enabled: boolean;
    createOffer(tenantId: string, userId: string): Promise<WebRtcSession>;
    handleAnswer(sessionId: string, sdpAnswer: string): Promise<void>;
    terminateSession(sessionId: string): Promise<void>;
}

export class WebRtcBridge implements IWebRtcBridge {
    readonly enabled: boolean;
    private readonly sessions = new Map<string, { tenantId: string; userId: string }>();

    constructor(
        private readonly config: WebRtcConfig,
        private readonly logger: Logger,
    ) {
        this.enabled = config.enabled;
    }

    async createOffer(tenantId: string, userId: string): Promise<WebRtcSession> {
        if (!this.enabled) {
            throw new Error("WebRTC is not enabled");
        }

        const sessionId = crypto.randomUUID();
        this.sessions.set(sessionId, { tenantId, userId });

        const iceServers: WebRtcSession["iceServers"] = this.config.stunServers.map(url => ({ urls: url }));

        if (this.config.turnServerUrl) {
            const turnCredential = this.config.turnCredentialRef
                ? process.env[this.config.turnCredentialRef]
                : undefined;
            iceServers.push({
                urls: this.config.turnServerUrl,
                credential: turnCredential,
            });
        }

        this.logger.info({ sessionId, tenantId }, "[webrtc] Session created");

        return { sessionId, iceServers };
    }

    async handleAnswer(sessionId: string, _sdpAnswer: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`WebRTC session not found: ${sessionId}`);
        }
        this.logger.debug({ sessionId }, "[webrtc] SDP answer received");
    }

    async terminateSession(sessionId: string): Promise<void> {
        this.sessions.delete(sessionId);
        this.logger.info({ sessionId }, "[webrtc] Session terminated");
    }
}
