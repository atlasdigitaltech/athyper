import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireQualificationLock } from "./qualification-lock.mjs";
test("overlapping captures fail closed; normal completion releases the lock", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bp-lock-")),
    file = path.join(dir, "lock");
  try {
    const release = acquireQualificationLock(file);
    assert.throws(() => acquireQualificationLock(file), /ALREADY_RUNNING/);
    release();
    const next = acquireQualificationLock(file);
    next();
    assert.equal(fs.existsSync(file), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("cleanup cannot remove a lock belonging to another run", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bp-lock-")),
    file = path.join(dir, "lock");
  try {
    const release = acquireQualificationLock(file);
    fs.writeFileSync(file, JSON.stringify({ token: "other" }));
    release();
    assert.equal(fs.existsSync(file), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
