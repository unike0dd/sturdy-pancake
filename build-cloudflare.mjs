import {createHash} from "node:crypto";
import {cp, lstat, mkdir, readFile, rm, writeFile} from "node:fs/promises";
import path from "node:path";

const profile = process.argv[2];
const allowlists = {
  owner: ["index.html", "app.js", "preview-session.js", "styles.css", "styles-base.css", "assets", "data", "i18n", ".well-known/security.txt"],
  consumer: ["index.html", "login.html", "app.js", "preview-session.js", "storefront.js", "login.js", "adaptive.js", "splash.js", "styles.css", "storefront.css", "login.css", "adaptive.css", "splash.css", "splash-transition.css", ".well-known/security.txt"]
};
if (!allowlists[profile]) throw new Error("Profile must be owner or consumer.");

const output = path.resolve("dist");
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});

for (const source of allowlists[profile]) {
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${source}`);
  const destination = path.join(output, source);
  await mkdir(path.dirname(destination), {recursive: true});
  await cp(source, destination, {recursive: info.isDirectory(), errorOnExist: false});
}

async function files(directory) {
  const {readdir} = await import("node:fs/promises");
  const entries = await readdir(directory, {withFileTypes: true});
  const outputFiles = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${full}`);
    if (entry.isDirectory()) outputFiles.push(...await files(full));
    else outputFiles.push(full);
  }
  return outputFiles;
}

const manifest = {
  schemaVersion: 1,
  repositoryCommit: process.env.GITHUB_SHA || "local",
  algorithm: "sha384",
  assets: {}
};
for (const file of (await files(output)).sort()) {
  const relative = path.relative(output, file).split(path.sep).join("/");
  const bytes = await readFile(file);
  manifest.assets[relative] = {
    bytes: bytes.byteLength,
    integrity: `sha384-${createHash("sha384").update(bytes).digest("base64")}`
  };
}
await mkdir(path.join(output, ".well-known"), {recursive: true});
await writeFile(path.join(output, ".well-known", "asset-manifest.json"), JSON.stringify(manifest, null, 2) + "\n", {mode: 0o644});
console.log(`Built ${Object.keys(manifest.assets).length} allowlisted assets for ${profile}.`);
