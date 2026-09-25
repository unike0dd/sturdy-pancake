import {readFile} from "node:fs/promises";

const base = process.env.DEPLOYMENT_URL;
if (!base) throw new Error("DEPLOYMENT_URL is required.");
const expected = JSON.parse(await readFile("dist/.well-known/asset-manifest.json", "utf8"));
const manifestResponse = await fetch(new URL("/.well-known/asset-manifest.json?verify=1", base), {redirect: "error"});
if (!manifestResponse.ok) throw new Error(`Manifest request failed: ${manifestResponse.status}`);
const actual = await manifestResponse.json();
if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Deployed asset manifest does not match this GitHub build.");

const response = await fetch(base, {redirect: "follow"});
if (!response.ok) throw new Error(`Site request failed: ${response.status}`);
for (const name of ["content-security-policy", "strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy", "cross-origin-resource-policy", "reporting-endpoints"]) {
  if (!response.headers.has(name)) throw new Error(`Deployment is missing ${name}`);
}
if (response.headers.has("x-xss-protection")) throw new Error("Deployment sends obsolete X-XSS-Protection.");
console.log("Cloudflare deployment integrity and security headers verified.");
