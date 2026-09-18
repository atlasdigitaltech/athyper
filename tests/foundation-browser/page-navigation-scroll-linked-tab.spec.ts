import { build } from "esbuild";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";

/**
 * Structural proof for the design question: can a PageNavigation tab host scroll-linked,
 * progressive section navigation (EntitySectionNavigation + useEntitySectionScroll, the same
 * pair EntityRecord360Panel already uses) without PageNavigation itself needing a new kind?
 * Both imports are real, unmodified source — no mocking, since section-navigation.tsx has no
 * external dependencies beyond React.
 */
const bundle = build({
  stdin: {
    resolveDir: process.cwd(),
    loader: "tsx",
    contents: `
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PageNavigation } from './packages/platform/shell/shell/src/page-navigation';
import { EntitySectionNavigation, useEntitySectionScroll } from './packages/platform/entity/runtime/form-detail/src/section-navigation';

const SECTIONS = [
  { key: 'alpha', label: 'Alpha' },
  { key: 'beta', label: 'Beta' },
  { key: 'gamma', label: 'Gamma' },
];

function ScrollLinkedSections() {
  const root = useRef(null);
  const [activeSection, setActiveSection] = useState('alpha');
  const [navigationRevision, setNavigationRevision] = useState(0);
  useEntitySectionScroll({
    root,
    attribute: 'data-section',
    contentSelector: '.fixture-sections',
    activeSection,
    navigationRevision,
    scopeKey: 'fixture',
    enabled: true,
    initialSection: 'alpha',
    onObserve: setActiveSection,
    getThreshold: () => 40,
  });
  function navigate(key) {
    setActiveSection(key);
    setNavigationRevision((value) => value + 1);
  }
  return React.createElement('div', { ref: root, style: { display: 'flex', gap: '16px' } },
    React.createElement(EntitySectionNavigation, { sections: SECTIONS, activeSection, onNavigate: navigate, label: 'Fixture sections' }),
    React.createElement('div', { className: 'fixture-sections', style: { flex: 1 } },
      SECTIONS.map((item) => React.createElement('section', { key: item.key, 'data-section': item.key, tabIndex: -1, style: { minHeight: '700px' } },
        React.createElement('h2', null, item.label),
      )),
    ),
  );
}

function Fixture() {
  const [tab, setTab] = useState('overview');
  return React.createElement(PageNavigation, {
    kind: 'tabs',
    ariaLabel: 'Fixture tabs',
    value: tab,
    onValueChange: setTab,
    items: [
      { value: 'overview', label: 'Overview', content: React.createElement(ScrollLinkedSections) },
      { value: 'settings', label: 'Settings', content: React.createElement('p', null, 'Settings content') },
    ],
  });
}

createRoot(document.getElementById('root')).render(React.createElement(Fixture));
`,
  },
  bundle: true,
  write: false,
  outfile: "fixture.js",
  format: "iife",
  platform: "browser",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"test"' },
  tsconfig: resolve("tooling/config/tsconfig-react.json"),
  logLevel: "silent",
}).then((result) => result.outputFiles.find((file) => file.path.endsWith(".js"))!.text);

test.beforeEach(async ({ page }) => {
  await page.route("https://fixture.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<style>*{box-sizing:border-box}[hidden]{display:none}[role=tabpanel]:not([hidden]){display:block}</style><div id="root"></div>`,
    }),
  );
});

test("a PageNavigation tab hosts scroll-linked section navigation, and switching tabs away and back does not break it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("https://fixture.test/");
  await page.addScriptTag({ content: await bundle });

  // Initial state: Overview tab active, rail visible, Alpha section in view.
  await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  const rail = page.getByRole("navigation", { name: "Fixture sections" });
  await expect(rail.getByRole("button", { name: "Beta" })).toBeVisible();

  // Explicit navigation scrolls to and focuses the target section.
  await rail.getByRole("button", { name: "Beta" }).click();
  await expect(page.locator('[data-section="beta"]')).toBeFocused();

  // Switch away to the Settings tab — Overview's content (and its scroll listeners) must not error
  // or crash while hidden.
  await page.getByRole("tab", { name: "Settings" }).click();
  await expect(page.getByText("Settings content")).toBeVisible();
  await expect(page.locator('[data-section="beta"]')).toBeHidden();

  // Switch back: the section-navigation state survived (still on Beta), and explicit navigation to a
  // different section still works correctly after the hide/show cycle — the actual claim being tested.
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(rail.getByRole("button", { name: "Beta" })).toBeVisible();
  await rail.getByRole("button", { name: "Gamma" }).click();
  await expect(page.locator('[data-section="gamma"]')).toBeFocused();

  expect(errors).toEqual([]);
});
