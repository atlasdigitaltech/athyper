import assert from "node:assert/strict";
import * as React from "react";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Checkbox, Dialog, DialogContent, Input, Label, Select, Tabs, TabsContent, TabsList, TabsTrigger, Toast, ToastRegion, Tooltip } from "../../packages/platform/foundation/ui/src/index";
import { ConfirmDialog, EmptyShellFrame, ErrorPage, LoginSkeleton } from "../../packages/platform/foundation/surface-kit/src/index";

describe("foundation component render contracts", () => {
  it("renders native and ARIA-safe primitives", () => {
    const html = renderToStaticMarkup(<><Button>Continue</Button><Label htmlFor="email">Email</Label><Input id="email" required /><Checkbox aria-label="Remember me" /><Select aria-label="Region"><option>Asia</option></Select><Tooltip label="Help"><button type="button">?</button></Tooltip></>);
    assert.match(html, /<button type="button"/);
    assert.match(html, /<label[^>]+for="email"/);
    assert.match(html, /type="checkbox"/);
    assert.match(html, /role="tooltip"/);
  });

  it("renders controlled tabs and dialog semantics", () => {
    const tabs = renderToStaticMarkup(<Tabs value="one"><TabsList><TabsTrigger value="one">One</TabsTrigger><TabsTrigger value="two">Two</TabsTrigger></TabsList><TabsContent value="one">First</TabsContent><TabsContent value="two">Second</TabsContent></Tabs>);
    assert.match(tabs, /role="tablist"/); assert.match(tabs, /aria-selected="true"/); assert.match(tabs, /role="tabpanel"/);
    const dialog = renderToStaticMarkup(<Dialog open><DialogContent title="Confirm" description="Review this action"><Button>Continue</Button></DialogContent></Dialog>);
    assert.match(dialog, /role="dialog"/); assert.match(dialog, /aria-modal="true"/); assert.match(dialog, /aria-labelledby=/);
  });

  it("builds every Phase 1 exit surface from foundation packages", () => {
    const html = renderToStaticMarkup(<><LoginSkeleton applicationName="Athyper Neon" /><ErrorPage description="Request failed" /><ToastRegion><Toast title="Saved">Ready</Toast></ToastRegion><ConfirmDialog open title="Continue?" description="Review" onConfirm={() => undefined} onOpenChange={() => undefined} /><EmptyShellFrame applicationName="Athyper Neon" /></>);
    for (const landmark of ["sign in loading", "Something went wrong", "Notifications", "role=\"dialog\"", "Primary navigation", "Skip to content"]) assert.match(html, new RegExp(landmark));
  });
});
