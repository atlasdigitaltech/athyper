import type { Router } from "express";
import {
  registerMasterAddressRoutes,
  type MasterAddressesRouteDeps,
} from "./routes/addresses.route.js";
import {
  registerMasterContactsRoutes,
  type MasterContactsRouteDeps,
} from "./routes/contacts.route.js";
import {
  registerMasterCompanyCodeProfileRoutes,
  type MasterCompanyCodeProfileRouteDeps,
  type CompanyCodeProfileResponse,
} from "./routes/company-code-profile.route.js";

export {
  registerMasterAddressRoutes,
  registerMasterContactsRoutes,
  registerMasterCompanyCodeProfileRoutes,
};
export type {
  MasterAddressesRouteDeps,
  MasterContactsRouteDeps,
  MasterCompanyCodeProfileRouteDeps,
  CompanyCodeProfileResponse,
};

export type MasterRoutesDeps =
  & MasterAddressesRouteDeps
  & MasterContactsRouteDeps
  & MasterCompanyCodeProfileRouteDeps;

export function registerMasterRoutes(router: Router, deps: MasterRoutesDeps): void {
  registerMasterContactsRoutes(router, deps);
  registerMasterAddressRoutes(router, deps);
  registerMasterCompanyCodeProfileRoutes(router, deps);
}
