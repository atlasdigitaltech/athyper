import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, Dialog, DialogContent, Toast, ToastRegion } from "../../packages/platform/foundation/ui/src/index";
import { EmptyShellFrame, ErrorPage, LoginSkeleton } from "../../packages/platform/foundation/surface-kit/src/index";

const name = process.argv[2];
const fixtures: Record<string, React.ReactElement> = {
  "login-skeleton": <LoginSkeleton applicationName="Athyper Neon" />,
  "error-page": <ErrorPage description="The request could not be completed." onRetry={() => undefined} />,
  toast: <main style={{ padding: "2rem" }}><h1>Notifications</h1><ToastRegion style={{ position: "static" }}><Toast title="Profile saved" tone="success">Your preferences are ready.</Toast></ToastRegion></main>,
  dialog: <main style={{ padding: "2rem" }}><h1>Confirmation</h1><Dialog open><DialogContent title="Discard changes?" description="Your unsaved changes will be lost."><Button>Keep editing</Button></DialogContent></Dialog></main>,
  "empty-shell": <EmptyShellFrame applicationName="Athyper Neon" />,
};
if (!name || !fixtures[name]) throw new TypeError(`Unknown foundation fixture: ${name ?? "<missing>"}`);
process.stdout.write(renderToStaticMarkup(fixtures[name]));
