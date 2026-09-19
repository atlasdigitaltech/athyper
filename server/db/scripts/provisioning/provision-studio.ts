#!/usr/bin/env tsx

import { isMain, runPlaneProvisionCli } from "./plane-cli.js";

if (isMain(import.meta.url)) await runPlaneProvisionCli("studio");
