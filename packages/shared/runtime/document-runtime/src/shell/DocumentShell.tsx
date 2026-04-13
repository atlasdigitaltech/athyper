/**
 * @athyper/document-runtime — Document Shell
 *
 * Rec 18: The composing container for document pages.
 * Layout order:
 *   1. Process Chain Ribbon (conditional)
 *   2. Document Header (identity + version badges + status lanes)
 *   3. Exception Stack
 *   4. Tab Bar + Content
 */
import { type ReactNode } from "react";
import { cn } from "@athyper/theme/utils";
import { type ProcessChain, type StatusLane, type DocumentException, type DocumentVersions } from "@athyper/api-contracts/documents";
import { ProcessChainRibbon } from "../chain/ProcessChainRibbon";
import { DocumentHeader, type MetadataCluster } from "../header/DocumentHeader";
import { ExceptionStack } from "../exceptions/ExceptionStack";

export interface DocumentShellProps {
  chain: ProcessChain | null;
  documentNumber: string;
  subtitle?: string;
  description?: string;
  statusLabel: string;
  statusIntent?: "neutral" | "info" | "success" | "warning" | "error";
  versions?: DocumentVersions;
  statusLanes?: StatusLane[];
  clusters?: MetadataCluster[];
  actions?: ReactNode;
  icon?: ReactNode;
  exceptions?: DocumentException[];
  children: ReactNode;
  className?: string;
}

export function DocumentShell({
  chain,
  documentNumber,
  subtitle,
  description,
  statusLabel,
  statusIntent,
  versions,
  statusLanes,
  clusters,
  actions,
  icon,
  exceptions,
  children,
  className,
}: DocumentShellProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {/* 1. Process Chain Ribbon */}
      {chain && chain.nodes.length > 0 && (
        <ProcessChainRibbon chain={chain} />
      )}

      {/* 2. Document Header */}
      <DocumentHeader
        documentNumber={documentNumber}
        subtitle={subtitle}
        description={description}
        statusLabel={statusLabel}
        statusIntent={statusIntent}
        versions={versions}
        statusLanes={statusLanes}
        clusters={clusters}
        actions={actions}
        icon={icon}
      />

      {/* 3. Exception Stack */}
      {exceptions && exceptions.length > 0 && (
        <ExceptionStack exceptions={exceptions} />
      )}

      {/* 4. Tab Content */}
      {children}
    </div>
  );
}
