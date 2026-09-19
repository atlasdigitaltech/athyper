import { afterEach, describe, expect, it, vi } from "vitest";
import { createLifecycle } from "@athyper/server-foundation/lifecycle";
import { loadConfig } from "../../config/index.js";
import { createContainer } from "../create-container.js";
import { registerAdapters } from "../register-adapters.js";
afterEach(() => vi.unstubAllEnvs());
function setup() {
  vi.stubEnv("ATHYPER_ENV", "local");
  vi.stubEnv("NOTIFICATION_CAPTURE", "true");
  vi.stubEnv("EMAIL_PROVIDER", "smtp");
  vi.stubEnv("SMTP_HOST", "mailtrap");
  vi.stubEnv("SMTP_FROM", "local@capture.invalid");
  vi.stubEnv("SMTP_USER", ""); vi.stubEnv("SMTP_PASS", "");
}
describe("notification capture configuration", () => {
  it.each(["staging", "production", "qa", "typo"])("rejects capture for %s", (env) => {
    setup(); vi.stubEnv("ATHYPER_ENV", env);
    expect(() => loadConfig()).toThrow("NOTIFICATION_CAPTURE requires explicit");
  });
  it("rejects an external SMTP relay", () => {
    setup(); vi.stubEnv("SMTP_HOST", "smtp.example.com");
    expect(() => loadConfig()).toThrow("local Mailpit");
  });
  it("registers all capture transports without constructing live providers", async () => {
    setup();
    const config = loadConfig();
    config.sms = { ...config.sms, accountSid: "test", authToken: "test", fromNumber: "+10000000000" };
    const close = vi.fn();
    const createSms = vi.fn(), createMetaWhatsApp = vi.fn(), createFcmPush = vi.fn(), createWebPush = vi.fn();
    const lifecycle = createLifecycle(), container = createContainer();
    registerAdapters(container, config, lifecycle, {
      createEmail: () => ({ channel: "email", send: async () => ({}), health: async () => ({ status: "healthy" }), close }),
      createSms, createMetaWhatsApp, createFcmPush, createWebPush,
    });
    expect([...container.adapters.notificationChannels.keys()]).toEqual(["email", "sms", "whatsapp"]);
    expect(container.adapters.pushTransports[0]?.platforms).toEqual(["web", "android", "ios"]);
    for (const factory of [createSms, createMetaWhatsApp, createFcmPush, createWebPush]) expect(factory).not.toHaveBeenCalled();
    await lifecycle.shutdown("test");
    expect(close).toHaveBeenCalledOnce();
  });
});
