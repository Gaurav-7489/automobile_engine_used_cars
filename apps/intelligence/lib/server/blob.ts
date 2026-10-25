/**
 * Minimal Vercel Blob upload over its HTTP API (the same request the official SDK makes), so the shared
 * lockfile and the other apps are untouched. Configured by BLOB_READ_WRITE_TOKEN, which Vercel sets when a
 * Blob store is connected to the project.
 */
const API = "https://vercel.com/api/blob";
const API_VERSION = "13";

export const blobConfigured = (): boolean => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export async function putPublicBlob(pathname: string, body: ArrayBuffer, contentType: string): Promise<{ url: string; pathname: string }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Photo storage is not configured.");
  const storeId = token.split("_")[3] ?? "";
  const response = await fetch(`${API}/?${new URLSearchParams({ pathname })}`, {
    method: "PUT",
    body,
    headers: {
      authorization: `Bearer ${token}`,
      "x-api-version": API_VERSION,
      "x-vercel-blob-store-id": storeId,
      "x-vercel-blob-access": "public",
      "x-content-type": contentType,
      "x-add-random-suffix": "1",
      "x-content-length": String(body.byteLength),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Photo storage refused the upload (${response.status}).`);
  const json = (await response.json()) as { url?: string; pathname?: string };
  if (!json.url) throw new Error("Photo storage returned no address.");
  return { url: json.url, pathname: json.pathname ?? pathname };
}
