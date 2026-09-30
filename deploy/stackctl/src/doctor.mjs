import { existsSync, statfsSync } from "node:fs";
import { platform } from "node:os";
import { TOOLCHAIN } from "./constants.mjs";
import { modeBits, runReadOnly, runtimeRoot, versionAtLeast } from "./io.mjs";
import { qualificationGateFailures } from "./qualification.mjs";

function check(id, status, detail, remediation) {
  return { id, status, detail, ...(status !== "pass" && remediation ? { remediation } : {}) };
}

export function collectDoctor(repoRoot) {
  const checks = [];
  checks.push(check(
    "node",
    process.versions.node === TOOLCHAIN.node ? "pass" : "fail",
    `Node ${process.versions.node}; required ${TOOLCHAIN.node}`,
    `Install and activate Node ${TOOLCHAIN.node}.`,
  ));

  const pnpm = runReadOnly("pnpm", ["--version"]);
  checks.push(check(
    "pnpm",
    pnpm.ok && pnpm.stdout === TOOLCHAIN.pnpm ? "pass" : "fail",
    pnpm.ok ? `pnpm ${pnpm.stdout}; required ${TOOLCHAIN.pnpm}` : "pnpm is unavailable",
    `Activate pnpm ${TOOLCHAIN.pnpm} through Corepack.`,
  ));

  const sourceOnWindowsMount = platform() === "linux" && repoRoot.startsWith("/mnt/");
  const fileSystem = platform() === "linux"
    ? runReadOnly("stat", ["-f", "-c", "%T", repoRoot]).stdout
    : platform();
  checks.push(check(
    "source-filesystem",
    sourceOnWindowsMount ? "fail" : "pass",
    `${repoRoot} (${fileSystem || "unknown filesystem"})`,
    "Keep source inside the Ubuntu ext4 filesystem.",
  ));

  const runtime = runtimeRoot();
  const runtimeExists = existsSync(runtime);
  const runtimeMode = runtimeExists && platform() !== "win32" ? modeBits(runtime) : null;
  checks.push(check(
    "runtime-root",
    runtimeExists && (runtimeMode === null || runtimeMode === 0o700) ? "pass" : "warn",
    runtimeExists ? `${runtime}${runtimeMode === null ? "" : ` mode ${runtimeMode.toString(8)}`}` : `${runtime} does not exist`,
    `Create ${runtime} with owner-only permissions during bootstrap.`,
  ));

  const docker = runReadOnly("docker", ["version", "--format", "{{.Server.Version}}"], { timeout: 12_000 });
  checks.push(check(
    "docker-engine",
    docker.ok && versionAtLeast(docker.stdout, TOOLCHAIN.dockerMinimum) ? "pass" : "fail",
    docker.ok ? `Docker Engine ${docker.stdout}` : (docker.stderr || docker.error || "Docker Engine unavailable"),
    `Start Docker Desktop and use Engine ${TOOLCHAIN.dockerMinimum} or newer.`,
  ));

  const compose = runReadOnly("docker", ["compose", "version", "--short"]);
  checks.push(check(
    "docker-compose",
    compose.ok && versionAtLeast(compose.stdout, TOOLCHAIN.composeMinimum) ? "pass" : "fail",
    compose.ok ? `Docker Compose ${compose.stdout}` : (compose.stderr || compose.error || "Compose unavailable"),
    `Install Compose ${TOOLCHAIN.composeMinimum} or newer.`,
  ));

  const disk = statfsSync(repoRoot);
  const freeGiB = Number(disk.bavail * disk.bsize) / 1024 ** 3;
  checks.push(check(
    "disk-headroom",
    freeGiB >= 100 ? "pass" : freeGiB >= 50 ? "warn" : "fail",
    `${freeGiB.toFixed(1)} GiB free on the source filesystem`,
    "Keep at least 100 GiB free for builds, images, volumes, and backups.",
  ));

  const qualification = qualificationGateFailures();
  checks.push(check(
    "host-qualification",
    qualification.failures.length === 0 ? "pass" : "warn",
    qualification.failures.length
      ? `Pending: ${qualification.failures.join(", ")}`
      : qualification.path,
    "Complete the pending elevated/user gates recorded in D:\\ATHYPER\\qualification\\machine\\phase-status.yaml.",
  ));

  checks.push(check(
    "docker-physical-storage",
    "warn",
    "Docker reports its Linux root, not the physical Windows VHD location",
    "Confirm Docker Desktop disk image location is D:\\ATHYPER\\docker-desktop\\data.",
  ));

  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "DoctorReport",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    summary: {
      pass: checks.filter((item) => item.status === "pass").length,
      warn: checks.filter((item) => item.status === "warn").length,
      fail: checks.filter((item) => item.status === "fail").length,
    },
    checks,
  };
}
