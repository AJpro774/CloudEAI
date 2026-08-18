import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workerDirectory = resolve(scriptDirectory, "..");
const rootDirectory = resolve(workerDirectory, "../..");
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

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

const envLocal = await readOptional(resolve(rootDirectory, ".env.local"));
const geminiKey = readValue(envLocal, "GEMINI_API_KEY");
if (/[\r\n]/.test(geminiKey)) {
  throw new Error("An API key contains an unexpected line break.");
}

await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, `GEMINI_API_KEY=${geminiKey}\n`, { mode: 0o600 });
