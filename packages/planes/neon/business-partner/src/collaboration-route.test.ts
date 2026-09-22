import { expect, it } from "vitest";
import { isCollaborationRequested } from "./collaboration-route";

it("keeps ordinary record links closed and honors explicit collaboration links", () => {
  expect(isCollaborationRequested("")).toBe(false);
  expect(isCollaborationRequested("?tab=360&section=overview")).toBe(false);
  expect(isCollaborationRequested("?panel=closed&collaborationSection=comments")).toBe(false);
  expect(isCollaborationRequested("?panel=atlas")).toBe(false);
  expect(isCollaborationRequested("?panel=collaboration&collaborationSection=comments")).toBe(true);
  expect(isCollaborationRequested("?panel=collaboration&collaborationSection=attachments&collaborationMode=content")).toBe(true);
});
