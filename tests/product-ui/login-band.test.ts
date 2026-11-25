import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("the automotive login stacks its artwork above the form on small screens", async () => {
  const [page, css, artwork] = await Promise.all([
    readFile("apps/intelligence/components/login/login-experience.tsx", "utf8"),
    readFile("apps/intelligence/components/login/login-experience.module.css", "utf8"),
    readFile("apps/intelligence/public/automotive-login.webp"),
  ]);

  assert.match(page, /<header className=\{styles\.hero\}>[\s\S]*<main className=\{styles\.panel\} id="content"/);
  assert.match(css, /url\("\/automotive-login\.webp"\)/);
  assert.equal(artwork.toString("ascii", 8, 12), "WEBP");
  assert.match(css, /@media \(max-width: 800px\) \{\s*\.shell \{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(page, /label="Business email"/, "migration sign-in keeps its field label");
});
