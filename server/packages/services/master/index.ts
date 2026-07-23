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
import {
  registerMasterOwnerAddressContactRoutes,
  type MasterOwnerAddressContactRouteDeps,
} from "./routes/owner-address-contact.route.js";

export {
  registerMasterAddressRoutes,
  registerMasterContactsRoutes,
  registerMasterCompanyCodeProfileRoutes,
  registerMasterOwnerAddressContactRoutes,
};
export type {
  MasterAddressesRouteDeps,
  MasterContactsRouteDeps,
  MasterCompanyCodeProfileRouteDeps,
  CompanyCodeProfileResponse,
  MasterOwnerAddressContactRouteDeps,
};

export type MasterRoutesDeps =
  & MasterAddressesRouteDeps
  & MasterContactsRouteDeps
  & MasterCompanyCodeProfileRouteDeps
  & MasterOwnerAddressContactRouteDeps;

export function registerMasterRoutes(router: Router, deps: MasterRoutesDeps): void {
  registerMasterContactsRoutes(router, deps);
  registerMasterAddressRoutes(router, deps);
  registerMasterCompanyCodeProfileRoutes(router, deps);
  registerMasterOwnerAddressContactRoutes(router, deps);
}
