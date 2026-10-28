import { z } from "zod";

export const MAX_SESSION_ATTACHMENTS_PER_MESSAGE = 6;
/** Per-attachment byte cap, enforced by the attachment store and every producer. */
export const SESSION_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** @deprecated Use {@link SESSION_ATTACHMENT_MAX_BYTES}; retained for callers not yet migrated. */
export const SESSION_ATTACHMENT_IMAGE_MAX_BYTES = SESSION_ATTACHMENT_MAX_BYTES;
export const SESSION_ATTACHMENT_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;
/** Text formats the model reads inline as prompt text rather than as a file. */
export const SESSION_ATTACHMENT_TEXT_MIME_TYPES = [
  "text/markdown",
  "application/json",
  "text/html",
] as const;
export type SessionAttachmentTextMimeType = (typeof SESSION_ATTACHMENT_TEXT_MIME_TYPES)[number];
export const SESSION_ATTACHMENT_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  ...SESSION_ATTACHMENT_TEXT_MIME_TYPES,
] as const;
/** Every MIME type accepted as a session attachment (images + documents). */
export const SESSION_ATTACHMENT_MIME_TYPES = [
  ...SESSION_ATTACHMENT_IMAGE_MIME_TYPES,
  ...SESSION_ATTACHMENT_DOCUMENT_MIME_TYPES,
] as const;

export const sessionAttachmentMimeTypeSchema = z.enum(SESSION_ATTACHMENT_MIME_TYPES);
export type SessionAttachmentMimeType = z.infer<typeof sessionAttachmentMimeTypeSchema>;

export function isSessionAttachmentTextMimeType(
  mimeType: string
): mimeType is SessionAttachmentTextMimeType {
  return (SESSION_ATTACHMENT_TEXT_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * MIME types operating systems assign to any text file whose type they don't
 * know. Chrome on Windows commonly reports `text/plain`, and some browsers no
 * type at all. An empty type is serialized as `application/octet-stream` in
 * multipart bodies, so the server sees that rather than the empty string.
 */
const SESSION_ATTACHMENT_TEXT_MIME_ALIASES = [
  "",
  "application/octet-stream",
  "text/plain",
] as const;

/**
 * Per text format: the file extensions that identify it, and the extra MIME
 * labels (beyond the generic aliases above) browsers report for it.
 */
export const SESSION_ATTACHMENT_TEXT_FORMATS: Record<
  SessionAttachmentTextMimeType,
  { extensions: readonly string[]; aliases: readonly string[] }
> = {
  "text/markdown": { extensions: [".md", ".markdown"], aliases: ["text/x-markdown"] },
  "application/json": { extensions: [".json"], aliases: ["text/json", "application/x-json"] },
  "text/html": { extensions: [".html", ".htm"], aliases: [] },
};

/** Every extension the file picker should offer for the text formats. */
export const SESSION_ATTACHMENT_TEXT_EXTENSIONS = SESSION_ATTACHMENT_TEXT_MIME_TYPES.flatMap(
  (mimeType) => SESSION_ATTACHMENT_TEXT_FORMATS[mimeType].extensions
);

/** File extensions treated as Markdown when the browser's MIME type is unreliable. */
export const SESSION_ATTACHMENT_MARKDOWN_EXTENSIONS =
  SESSION_ATTACHMENT_TEXT_FORMATS["text/markdown"].extensions;
/** MIME labels folded into `text/markdown` for a `.md` or `.markdown` file. */
export const SESSION_ATTACHMENT_MARKDOWN_MIME_ALIASES = [
  ...SESSION_ATTACHMENT_TEXT_MIME_ALIASES,
  ...SESSION_ATTACHMENT_TEXT_FORMATS["text/markdown"].aliases,
] as const;

/** The text format a file name's extension identifies, if any. */
export function sessionAttachmentTextMimeTypeForFileName(
  fileName: string
): SessionAttachmentTextMimeType | null {
  const lower = fileName.toLowerCase();
  return (
    SESSION_ATTACHMENT_TEXT_MIME_TYPES.find((mimeType) =>
      SESSION_ATTACHMENT_TEXT_FORMATS[mimeType].extensions.some((extension) =>
        lower.endsWith(extension)
      )
    ) ?? null
  );
}

export function hasSessionAttachmentMarkdownExtension(fileName: string): boolean {
  return sessionAttachmentTextMimeTypeForFileName(fileName) === "text/markdown";
}

/**
 * Canonicalize the MIME type a browser attached to an uploaded file. A text
 * file (`.md`, `.json`, `.html`, ...) declared with a generic or known alias
 * label becomes its canonical type; every other declared type is returned
 * unchanged so callers still validate it against
 * {@link SESSION_ATTACHMENT_MIME_TYPES}.
 */
export function normalizeSessionAttachmentMimeType(declaredType: string, fileName: string): string {
  const textType = sessionAttachmentTextMimeTypeForFileName(fileName);
  if (!textType) return declaredType;
  const aliases: readonly string[] = [
    ...SESSION_ATTACHMENT_TEXT_MIME_ALIASES,
    ...SESSION_ATTACHMENT_TEXT_FORMATS[textType].aliases,
  ];
  return aliases.includes(declaredType) ? textType : declaredType;
}

export const sessionAttachmentIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9-]+$/);

/** Client-supplied reference to a file previously uploaded for this session. */
export const sessionAttachmentReferenceSchema = z
  .object({
    attachmentId: sessionAttachmentIdSchema,
    name: z.string().min(1).max(255),
  })
  .strict();

export const sessionAttachmentReferencesSchema = z
  .array(sessionAttachmentReferenceSchema)
  .max(MAX_SESSION_ATTACHMENTS_PER_MESSAGE);
export type SessionAttachmentReference = z.infer<typeof sessionAttachmentReferenceSchema>;

/** Server-resolved attachment metadata persisted with messages and events. */
export const resolvedSessionAttachmentSchema = sessionAttachmentReferenceSchema
  .extend({
    mimeType: sessionAttachmentMimeTypeSchema,
  })
  .strict();
export type ResolvedSessionAttachment = z.infer<typeof resolvedSessionAttachmentSchema>;

export const resolvedSessionAttachmentsSchema = z
  .array(resolvedSessionAttachmentSchema)
  .max(MAX_SESSION_ATTACHMENTS_PER_MESSAGE);

/**
 * Body of a successful upload to `POST /sessions/:id/attachments`, parsed by
 * every client that turns an upload into a prompt reference. The id is the
 * canonical one, so an id that the prompt schema would reject is treated as a
 * failed upload where it arrives rather than being carried into client state
 * and failing later at prompt validation. Unknown keys are ignored so the
 * endpoint can add response fields without breaking deployed clients.
 */
export const sessionAttachmentUploadResponseSchema = z.object({
  attachmentId: sessionAttachmentIdSchema,
  mimeType: sessionAttachmentMimeTypeSchema,
});
export type SessionAttachmentUploadResponse = z.infer<typeof sessionAttachmentUploadResponseSchema>;
