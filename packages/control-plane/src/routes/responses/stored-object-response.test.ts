import { describe, expect, it } from "vitest";
import type { ObjectStorageMetadata } from "../../storage/object-storage";
import { createStoredObjectResponse } from "./stored-object-response";

function metadata(): ObjectStorageMetadata {
  return {
    size: 4,
    httpEtag: '"etag"',
    writeHttpMetadata: () => {},
  } as unknown as ObjectStorageMetadata;
}

describe("createStoredObjectResponse", () => {
  it("serves uploaded HTML sandboxed and as a download", () => {
    const response = createStoredObjectResponse(
      new Blob(["<p>"]).stream(),
      metadata(),
      "text/html"
    );

    expect(response.headers.get("Content-Security-Policy")).toBe("sandbox; default-src 'none'");
    expect(response.headers.get("Content-Disposition")).toBe("attachment");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("leaves other types inline", () => {
    const response = createStoredObjectResponse(new Blob(["x"]).stream(), metadata(), "image/png");

    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(response.headers.get("Content-Disposition")).toBeNull();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
