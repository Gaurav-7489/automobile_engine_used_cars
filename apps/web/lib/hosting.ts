/** File-backed reference data is browse-only on serverless hosting. */
export function isReadOnlyPreview() {
  return process.env.NEXT_PUBLIC_PREVIEW_READ_ONLY === "true" ||
    (process.env.VERCEL === "1" && process.env.DATA_MODE !== "aurora");
}
