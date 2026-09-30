import assert from "node:assert/strict";
import test from "node:test";
import {
  attachmentCapabilityUrl,
  runAttachmentUpload,
  putAttachmentBytes,
  validateUploadFile,
} from "../../packages/platform/communications/collaboration-ui/src/upload-lifecycle";
import {
  asComment,
  asAttachment,
} from "../../packages/platform/entity/runtime/form-detail/src/collaboration-read-models";
const file = new File(["pdf"], "proof.pdf", { type: "application/pdf" });
test("a lost finalize response resolves committed status without another PUT", async () => {
  let puts = 0,
    finalizes = 0;
  await runAttachmentUpload({
    file,
    contentType: file.type,
    stage: async () => ({
      attachmentId: "id",
      uploadUrl: "https://storage.test/file",
    }),
    request: async (_url, init) => {
      puts++;
      assert.equal(init?.redirect, "error");
      assert.equal(init?.credentials, "omit");
      assert.equal(init?.referrerPolicy, "no-referrer");
      assert.ok(init?.signal);
      return new Response(null, { status: 200 });
    },
    finalize: async () => {
      finalizes++;
      throw new DOMException("Timed out", "TimeoutError");
    },
    status: async () => ({ status: "active" }),
  });
  assert.equal(puts, 1);
  assert.equal(finalizes, 1);
});
test("an uncertain retry does not write bytes when status is unavailable", async () => {
  let stages = 0;
  await assert.rejects(
    runAttachmentUpload({
      file,
      contentType: file.type,
      retry: true,
      stage: async () => {
        stages++;
        return { attachmentId: "id", uploadUrl: "https://storage.test/file" };
      },
      status: async () => {
        throw new Error("offline");
      },
      finalize: async () => {},
    }),
    /offline/,
  );
  assert.equal(stages, 0);
});
test("unsafe storage capabilities fail before network access", async () => {
  for (const url of [
    "http://storage.test/file",
    "https://user:pass@storage.test/file",
    "https://storage.test/file#secret",
  ]) {
    await assert.rejects(
      putAttachmentBytes(url, file, file.type, undefined, async () => {
        throw new Error("must not fetch");
      }),
      /HTTPS capability/,
    );
  }
});
test("download and preview capability validation share the upload policy", () => {
  assert.equal(
    attachmentCapabilityUrl("http://localhost:9000/file").hostname,
    "localhost",
  );
  assert.throws(
    () => attachmentCapabilityUrl("http://storage.test/file"),
    /capability/,
  );
  assert.throws(
    () =>
      attachmentCapabilityUrl("https://neon.dev.athyper.test/file", {
        isolatedFromOrigin: "https://neon.dev.athyper.test",
      }),
    /isolated/,
  );
});
test("all upload surfaces reject empty, oversized and unsupported files", () => {
  assert.throws(
    () => validateUploadFile(new File([], "empty.pdf"), {}),
    /empty/,
  );
  assert.throws(() => validateUploadFile(file, { maxFileBytes: 1 }), /maximum/);
  assert.throws(
    () => validateUploadFile(file, { allowedContentTypes: ["image/png"] }),
    /unsupported/,
  );
  assert.equal(
    validateUploadFile(new File(["bytes"], "unknown"), {
      allowedContentTypes: ["application/octet-stream"],
    }),
    "application/octet-stream",
  );
});
test("read models reject malformed identifiers and nested data", () => {
  assert.throws(() => asComment({ text: "missing id" }));
  assert.throws(() =>
    asComment({ id: "a", pinnedFiles: [{ attachmentId: undefined }] }),
  );
  assert.throws(() =>
    asAttachment({ id: "a", fileName: "file", sizeBytes: "wrong" }),
  );
  assert.equal(asComment({ id: "a", text: "hello" }).text, "hello");
});
