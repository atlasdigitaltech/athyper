import { PrintTemplateRegistry } from "@athyper/entity-print/core";
import { SitePrintTemplate } from "./site/SitePrintTemplate";
import { WarehousePrintTemplate } from "./warehouse/WarehousePrintTemplate";

export function registerMasterTemplates(): void {
  PrintTemplateRegistry.register("site",      SitePrintTemplate);
  PrintTemplateRegistry.register("warehouse", WarehousePrintTemplate);
}

export { SitePrintTemplate } from "./site/SitePrintTemplate";
export { WarehousePrintTemplate } from "./warehouse/WarehousePrintTemplate";
