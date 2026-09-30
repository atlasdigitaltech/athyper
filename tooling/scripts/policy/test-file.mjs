// Shared definition of "this file is a test" for the package-boundary policies.
//
// Boundary rules describe how shipped code may depend on other packages. A test
// is not shipped: an integration test legitimately wires a service to a database,
// and a component test legitimately imports the server package whose behavior it
// asserts. Holding tests to the shipping rule forces indirection that exists only
// to satisfy the checker, so the boundary policies exempt them.
//
// The exemption is deliberately narrow. It covers a file named *.test.* or
// *.spec.*, and any file under a __tests__ or tests directory — the places test
// code actually lives. Everything else stays in scope, including fixtures,
// helpers and provisioning scripts that merely sit near tests. Production code
// does not become exempt by being named after a test.

const TEST_FILENAME = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const TEST_DIRECTORY = /(?:^|\/)(?:__tests__|tests)\//;

/** `file` is a repo-relative or absolute path; separators may be either style. */
export function isTestFile(file) {
  const path = String(file).replaceAll("\\", "/");
  return TEST_FILENAME.test(path) || TEST_DIRECTORY.test(path);
}
