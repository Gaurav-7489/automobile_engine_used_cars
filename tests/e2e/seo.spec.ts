import {test,expect} from "@playwright/test";
test("public pages expose one H1, unique canonical, metadata and working internal destinations",async({request})=>{
 const sitemap=await request.get('/sitemap.xml');expect(sitemap.status()).toBe(200);
 const xml=await sitemap.text();const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>new URL(match[1]));
 expect(urls.length).toBeGreaterThan(5);
 const visited=new Set<string>();
 for(const url of urls) {
  const page=await request.get(url.pathname);expect(page.status(),url.pathname).toBe(200);
  const html=await page.text();
  expect((html.match(/<h1(?:\s|>)/g)||[]).length,url.pathname).toBe(1);
  const canonical=html.match(/rel="canonical" href="([^"]+)"/)?.[1];
  expect(canonical,url.pathname).toBeTruthy();expect(new URL(canonical!).href).toBe(url.href);
  expect(html).toMatch(/<meta name="description" content="[^"]+"/);
  expect(html).toMatch(/<meta property="og:image" content="[^"]+"/);
  expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/);
  const headings=[...html.matchAll(/<h([1-6])(?:\s|>)/g)].map(match=>Number(match[1]));
  for(let i=1;i<headings.length;i++)expect(headings[i],`${url.pathname}: heading jump`).toBeLessThanOrEqual(headings[i-1]+1);
  for(const match of html.matchAll(/href="(\/[^"#?]*)(?:[?#][^"]*)?"/g)){
   const path=match[1];if(path.startsWith('/_next/')||path.startsWith('/api/')||path.startsWith('/command')||path.startsWith('/platform')||visited.has(path))continue;
   visited.add(path);expect((await request.get(path)).status(),`broken internal destination ${path}`).toBeLessThan(400);
  }
 }
 const robots=await request.get('/robots.txt');expect(await robots.text()).toContain(`Sitemap: ${urls[0].origin}/sitemap.xml`);
 const image=await request.get('/opengraph-image');expect(image.status()).toBe(200);expect(image.headers()['content-type']).toContain('image/png');
});
