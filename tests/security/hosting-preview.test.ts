import { test } from "node:test";
import assert from "node:assert/strict";
import { isReadOnlyPreview } from "../../apps/web/lib/hosting";

test("file-backed serverless previews cannot accidentally enable operational writes", () => {
  const keys = ["VERCEL", "DATA_MODE", "NEXT_PUBLIC_PREVIEW_READ_ONLY"] as const;
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    delete process.env.NEXT_PUBLIC_PREVIEW_READ_ONLY;
    process.env.VERCEL = "1";
    process.env.DATA_MODE = "demo";
    assert.equal(isReadOnlyPreview(), true);
    delete process.env.DATA_MODE;
    assert.equal(isReadOnlyPreview(), true);
    process.env.DATA_MODE = "aurora";
    assert.equal(isReadOnlyPreview(), false);
    process.env.NEXT_PUBLIC_PREVIEW_READ_ONLY = "true";
    assert.equal(isReadOnlyPreview(), true);
    delete process.env.NEXT_PUBLIC_PREVIEW_READ_ONLY;
    delete process.env.VERCEL;
    process.env.DATA_MODE = "demo";
    assert.equal(isReadOnlyPreview(), false);
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
