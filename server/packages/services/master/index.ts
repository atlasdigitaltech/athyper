import type { Router } from "express";
import {
  registerMasterAddressRoutes,
  type MasterAddressesRouteDeps,
} from "./routes/addresses.route.js";
import {
  registerMasterContactsRoutes,
  type MasterContactsRouteDeps,
} from "./routes/contacts.route.js";

export {
  registerMasterAddressRoutes,
  registerMasterContactsRoutes,
};
export type {
  MasterAddressesRouteDeps,
  MasterContactsRouteDeps,
};

export type MasterRoutesDeps = MasterAddressesRouteDeps & MasterContactsRouteDeps;

export function registerMasterRoutes(router: Router, deps: MasterRoutesDeps): void {
  registerMasterContactsRoutes(router, deps);
  registerMasterAddressRoutes(router, deps);
}
