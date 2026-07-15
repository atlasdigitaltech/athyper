import { PrintTemplateRegistry } from "@athyper/entity-print/core";
import { SitePrintTemplate } from "./site/site-print-template";
import { WarehousePrintTemplate } from "./warehouse/warehouse-print-template";

export function registerMasterTemplates(): void {
  PrintTemplateRegistry.register("site",      SitePrintTemplate);
  PrintTemplateRegistry.register("warehouse", WarehousePrintTemplate);
}

export { SitePrintTemplate } from "./site/site-print-template";
export { WarehousePrintTemplate } from "./warehouse/warehouse-print-template";
