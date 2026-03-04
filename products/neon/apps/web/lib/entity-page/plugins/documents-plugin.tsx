/**
 * Documents Plugin for Entity Pages
 *
 * Adds a "Documents" tab to all entity pages with file upload
 * and attachment management capabilities.
 */

import { EntityDocumentsPanel } from "@athyper/ui/content/attachments";

import type { TabPlugin, TabPluginProps } from "../plugin-registry";

/**
 * Documents Tab Component
 *
 * Renders the EntityDocumentsPanel with entity context from the page.
 */
function DocumentsTab({ entityName, entityId }: TabPluginProps) {
  return (
    <div className="p-6">
      <EntityDocumentsPanel entityType={entityName} entityId={entityId} title="Documents" />
    </div>
  );
}

/**
 * Documents Plugin Registration
 *
 * This plugin adds a "Documents" tab to entity pages.
 * The tab shows attached files and provides upload capabilities.
 */
export const documentsTabPlugin: TabPlugin = {
  code: "documents",
  component: DocumentsTab,
};
