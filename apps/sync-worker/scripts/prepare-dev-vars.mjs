import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workerDirectory = resolve(scriptDirectory, "..");
const rootEnvironmentPath = resolve(workerDirectory, "../../.env.local");
const targetPath = resolve(workerDirectory, ".dev.vars");

function readValue(source, name) {
  const line = source
    .split(/\r?\n/)
    .find((candidate) => candidate.trimStart().startsWith(`${name}=`));
  if (!line) return "";
  const value = line.slice(line.indexOf("=") + 1).trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

let source = "";
try {
  source = await readFile(rootEnvironmentPath, "utf8");
} catch {
  // CI and fresh clones intentionally receive an empty development secret.
}

const apiKey = readValue(source, "GEMINI_API_KEY");
if (/[\r\n]/.test(apiKey)) {
  throw new Error("GEMINI_API_KEY contains an unexpected line break.");
}

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, `GEMINI_API_KEY=${apiKey}\n`, {
  mode: 0o600,
});
