#!/usr/bin/env tsx

import { isMain, runPlaneProvisionCli } from "./provisioning/plane-cli.js";

if (isMain(import.meta.url)) await runPlaneProvisionCli("neon");
