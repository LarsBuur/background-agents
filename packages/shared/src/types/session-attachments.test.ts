import { describe, expect, it } from "vitest";
import {
  normalizeSessionAttachmentMimeType,
  sessionAttachmentMimeTypeSchema,
} from "./session-attachments";

describe("normalizeSessionAttachmentMimeType", () => {
  it.each([
    ["notes.md", "text/plain", "text/markdown"],
    ["notes.markdown", "text/x-markdown", "text/markdown"],
    ["data.json", "", "application/json"],
    ["data.JSON", "text/plain", "application/json"],
    ["data.json", "text/json", "application/json"],
    ["page.html", "application/octet-stream", "text/html"],
    ["page.htm", "", "text/html"],
  ])("maps %s declared as %j to %s", (fileName, declaredType, expected) => {
    expect(normalizeSessionAttachmentMimeType(declaredType, fileName)).toBe(expected);
  });

  it("keeps a specific declared type that contradicts the extension", () => {
    expect(normalizeSessionAttachmentMimeType("image/png", "data.json")).toBe("image/png");
  });

  it("leaves files without a text extension alone", () => {
    expect(normalizeSessionAttachmentMimeType("text/plain", "notes.txt")).toBe("text/plain");
  });
});

describe("sessionAttachmentMimeTypeSchema", () => {
  it.each(["application/json", "text/html", "text/markdown", "application/pdf"])(
    "accepts %s",
    (mimeType) => {
      expect(sessionAttachmentMimeTypeSchema.safeParse(mimeType).success).toBe(true);
    }
  );
});
