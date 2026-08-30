import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const outputRoot = path.resolve("dist");
const forbidden = [
  /__manus__/i,
  /manus-cookie/i,
  /manus-runtime/i,
  /sessionReplay/i,
  /VITE_ANALYTICS_ENDPOINT/,
  /VITE_ANALYTICS_WEBSITE_ID/,
];

async function filesBelow(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry);
    const details = await stat(absolutePath);
    if (details.isDirectory()) files.push(...(await filesBelow(absolutePath)));
    else files.push(absolutePath);
  }
  return files;
}

const findings = [];
for (const file of await filesBelow(outputRoot)) {
  const contents = await readFile(file, "utf8").catch(() => "");
  for (const pattern of forbidden) {
    if (pattern.test(contents))
      findings.push(`${path.relative(outputRoot, file)}: ${pattern}`);
  }
}

if (findings.length > 0) {
  console.error("Forbidden production artifacts detected:");
  findings.forEach(finding => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(
  "Production output contains no forbidden runtime, replay, or analytics placeholders."
);
