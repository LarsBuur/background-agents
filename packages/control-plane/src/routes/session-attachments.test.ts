import { describe, expect, it, vi } from "vitest";
import { SESSION_ATTACHMENT_MAX_REQUEST_BYTES } from "../media";
import type { Env } from "../types";
import { handleAttachmentPost } from "./session-attachments";
import type { RequestContext } from "./shared";
import type { SqlDatabase } from "../db/sql-database";
import { TEST_BACKGROUND_TASK_CONTEXT, fakeSessionRuntimeDispatch } from "../router.test-support";
import { withSessionRuntime } from "./session-route";

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createContext(): RequestContext {
  return {
    trace_id: "trace-1",
    request_id: "request-1",
    db: {} as SqlDatabase,
    executionCtx: TEST_BACKGROUND_TASK_CONTEXT,
    metrics: {
      sqlQueries: [],
      spans: {},
      time: async <T>(_name: string, fn: () => Promise<T>) => fn(),
      summarize: () => ({}),
    },
  };
}

function createEnv(fetch: (request: Request) => Promise<Response>) {
  const put = vi.fn(async () => null);
  const remove = vi.fn(async () => undefined);
  const env = {
    SESSION: fakeSessionRuntimeDispatch(fetch),
    MEDIA_BUCKET: {
      put,
      delete: remove,
      head: vi.fn(),
      get: vi.fn(),
    },
  } as unknown as Env;
  return { env, put, remove };
}

function attachmentUploadRequest(): Request {
  const form = new FormData();
  form.append("file", new File([PNG_BYTES], "image.png", { type: "image/png" }));
  return new Request("https://test.local/sessions/session-1/attachments", {
    method: "POST",
    body: form,
  });
}

function markdownUploadRequest(declaredType: string, fileName = "notes.md"): Request {
  const form = new FormData();
  form.append("file", new File(["# Notes\n\nHello"], fileName, { type: declaredType }));
  return new Request("https://test.local/sessions/session-1/attachments", {
    method: "POST",
    body: form,
  });
}

function oversizedStreamingUploadRequest(): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(SESSION_ATTACHMENT_MAX_REQUEST_BYTES + 1));
      controller.close();
    },
  });
  return new Request("https://test.local/sessions/session-1/attachments", {
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=test" },
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("session attachment routes", () => {
  it("bounds streamed requests when Content-Length is unavailable", async () => {
    const fetch = vi.fn(async () => Response.json({ status: "ok" }));
    const { env, put } = createEnv(fetch);

    const response = await handleAttachmentPost(
      oversizedStreamingUploadRequest(),
      env,
      { id: "session-1" },
      withSessionRuntime(env, createContext())
    );

    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it.each(["text/markdown", "text/plain", "text/x-markdown", "application/octet-stream", ""])(
    "stores a .md file the browser declared as %j as text/markdown",
    async (declaredType) => {
      const fetch = vi.fn(async () => Response.json({ status: "ok" }));
      const { env, put } = createEnv(fetch);

      const response = await handleAttachmentPost(
        markdownUploadRequest(declaredType),
        env,
        { id: "session-1" },
        withSessionRuntime(env, createContext())
      );

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({ mimeType: "text/markdown" });
      expect(put).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects a text/plain file that is not named as Markdown", async () => {
    const fetch = vi.fn(async () => Response.json({ status: "ok" }));
    const { env, put } = createEnv(fetch);

    const response = await handleAttachmentPost(
      markdownUploadRequest("text/plain", "notes.txt"),
      env,
      { id: "session-1" },
      withSessionRuntime(env, createContext())
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Unsupported attachment MIME type" });
    expect(put).not.toHaveBeenCalled();
  });

  it.each([
    [404, "Session not found", 404],
    [429, "Quota exceeded", 429],
    [500, "Registry failed", 502],
  ])(
    "maps attachment service failures to route responses: %s -> %s",
    async (registryStatus, message, routeStatus) => {
      const fetch = vi.fn(async () =>
        Response.json({ error: message }, { status: registryStatus })
      );
      const { env, put } = createEnv(fetch);

      const response = await handleAttachmentPost(
        attachmentUploadRequest(),
        env,
        { id: "session-1" },
        withSessionRuntime(env, createContext())
      );

      expect(response.status).toBe(routeStatus);
      await expect(response.json()).resolves.toEqual({ error: message });
      expect(put).not.toHaveBeenCalled();
    }
  );

  it("maps cleanup failures to a service-unavailable response", async () => {
    const responses = [
      Response.json({
        status: "cleanup_required",
        cleanupClaimedAt: 1000,
        staleAttachments: [
          { attachmentId: "old-1", objectKey: "sessions/session-1/attachments/old-1" },
        ],
      }),
      Response.json({ status: "ok" }),
    ];
    const fetch = vi.fn(async () => {
      const response = responses.shift();
      if (!response) throw new Error("Missing test response");
      return response;
    });
    const { env, put, remove } = createEnv(fetch);
    remove.mockRejectedValue(new Error("R2 unavailable"));

    const response = await handleAttachmentPost(
      attachmentUploadRequest(),
      env,
      { id: "session-1" },
      withSessionRuntime(env, createContext())
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to clean up expired attachments; please retry",
    });
    expect(put).not.toHaveBeenCalled();
  });
});
