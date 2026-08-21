import assert from "node:assert/strict";
import * as React from "react";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Card, Input, Label, Toast } from "../../packages/platform/foundation/ui/src/index";
import { EmptyShellFrame, LoginSkeleton } from "../../packages/platform/foundation/surface-kit/src/index";

it("matches the deterministic foundation markup snapshot", () => {
  const html = renderToStaticMarkup(<><Card><Label htmlFor="identity">Identity</Label><Input id="identity" /><Button>Continue</Button></Card><Toast title="Ready">Signed in</Toast><LoginSkeleton applicationName="Athyper Neon" /><EmptyShellFrame applicationName="Athyper Neon" /></>);
  const actual = {
    classes: [...html.matchAll(/class="([^"]+)"/g)].map((match) => match[1]),
    landmarks: [...html.matchAll(/<(main|header|aside)\b/g)].map((match) => match[1]),
    roles: [...html.matchAll(/role="([^"]+)"/g)].map((match) => match[1]),
    labels: [...html.matchAll(/aria-label="([^"]+)"/g)].map((match) => match[1]),
  };
  assert.deepEqual(actual, JSON.parse(readFileSync("tests/foundation/__snapshots__/foundation-markup.json", "utf8")));
});
