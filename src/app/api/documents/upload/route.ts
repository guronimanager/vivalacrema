import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { finalizeDocument, validatePathname } from "@/lib/onedrive/documents";
import {
  contentTypes,
  maximumFileSize,
  validateMetadata,
} from "@/lib/document-format";
import {
  ArchiveError,
  assertOrigin,
  failure,
  requireSession,
} from "@/lib/onedrive/security";
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        assertOrigin(request);
        const current = await requireSession();
        validatePathname(pathname);
        let metadata;
        try {
          metadata = validateMetadata(JSON.parse(clientPayload || "null"));
        } catch {
          throw new ArchiveError("Belge bilgileri geçersiz.");
        }
        return {
          allowedContentTypes: contentTypes,
          maximumSizeInBytes: maximumFileSize,
          validUntil: Date.now() + 30 * 60 * 1000,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({
            metadata,
            accountId: current.accountId,
          }),
        };
      },
      onUploadCompleted:
        process.env.VERCEL || process.env.VERCEL_BLOB_CALLBACK_URL
          ? async ({ blob, tokenPayload }) => {
              // handleUpload validates Blob's callback signature before entering here.
              const payload = JSON.parse(tokenPayload || "null") as {
                metadata: ReturnType<typeof validateMetadata>;
                accountId: string;
              };
              await finalizeDocument(
                blob.pathname,
                payload.metadata,
                payload.accountId,
              );
            }
          : undefined,
    });
    return Response.json(response);
  } catch (error) {
    return failure(error);
  }
}
