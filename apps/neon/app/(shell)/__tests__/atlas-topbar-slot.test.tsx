import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Topbar } from "@athyper/shell";

describe("shared Topbar assistant slot", () => {
  it("keeps launcher, assistant, notifications, and user controls in keyboard order", () => {
    const html = renderToStaticMarkup(
      <Topbar
        onSearchClick={() => undefined}
        assistantSlot={(
          <button type="button" aria-label="Open Atlas">Open Atlas</button>
        )}
        onNotificationClick={() => undefined}
        userSlot={<button type="button">Account</button>}
      />,
    );

    const launcher = html.indexOf('aria-label="Open launcher"');
    const assistant = html.indexOf('data-topbar-slot="assistant"');
    const notifications = html.indexOf('aria-label="Notifications"');
    const account = html.indexOf(">Account</button>");
    expect(launcher).toBeGreaterThan(-1);
    expect(assistant).toBeGreaterThan(launcher);
    expect(notifications).toBeGreaterThan(assistant);
    expect(account).toBeGreaterThan(notifications);
    expect(html).toContain('aria-label="Open Atlas"');
  });

  it("adds no assistant wrapper when the optional slot is absent", () => {
    const html = renderToStaticMarkup(<Topbar />);
    expect(html).not.toContain('data-topbar-slot="assistant"');
  });
});
