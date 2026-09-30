import { expect, it } from "vitest";
import { compileFieldPattern } from "../field-pattern.js";
it.each(["^[A-Z]{2}$", "^\\d{8,15}$", "^[a-z]+$", "^REF-[0-9]{1,20}$"])("supports bounded pattern %s", pattern => {
  expect(compileFieldPattern(pattern)).toBeInstanceOf(RegExp);
});
it.each(["[", "(a+)+$", "^(a+)+$", "^(a|aa)+$", "^a+a+$", "^(?=a)a$", "^(a)\\1$", "^a{100000}$", "a+", 42])("rejects unsafe/unsupported pattern %s", pattern => {
  expect(() => compileFieldPattern(pattern)).toThrowError(expect.objectContaining({code:"METADATA_FIELD_PATTERN_INVALID"}));
});
