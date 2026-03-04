// lib/entity-page/register-plugins.ts
//
// Registers built-in entity page tab plugins.
// Import this file once at app startup (e.g., in a root layout or provider)
// to make lifecycle + approvals tabs available.


import { registerTabPlugin } from "./plugin-registry";
import { documentsTabPlugin } from "./plugins/documents-plugin";
import {
  invoiceLinesPlugin,
  journalLinesPlugin,
  paymentAllocationsPlugin,
  decisionScorePlugin,
} from "./plugins/finance-plugin";

import { ApprovalsTab } from "@/components/entity-page/ApprovalsTab";
import { LifecycleTab } from "@/components/entity-page/LifecycleTab";

let registered = false;

export function registerBuiltInPlugins(): void {
  if (registered) return;
  registered = true;

  registerTabPlugin({
    code: "lifecycle",
    component: LifecycleTab,
  });

  registerTabPlugin({
    code: "approvals",
    component: ApprovalsTab,
  });

  registerTabPlugin(documentsTabPlugin);

  // Finance tabs
  registerTabPlugin(invoiceLinesPlugin);
  registerTabPlugin(journalLinesPlugin);
  registerTabPlugin(paymentAllocationsPlugin);
  registerTabPlugin(decisionScorePlugin);
}
