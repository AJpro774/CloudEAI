import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptDirectory, "..");
const binaryDirectory = join(projectDirectory, "src-tauri", "binaries");
const targetBinary = join(
  binaryDirectory,
  "llama-server-aarch64-apple-darwin",
);

const release = {
  tag: "b10472",
  archive: "llama-b10472-bin-macos-arm64.tar.gz",
  sha256: "194a3e7008cc8c4e7a8d201012f4a32102333664c2eb7d0511d091589c48a13c",
  executableSha256:
    "ede8dfd91bfbb579705c13df583aa6985c0abfd30fbc5d823d242f09e5e30d74",
};

const bundleLibraryRpath = "@loader_path/../Resources/binaries";

function ensureBundleRpath(binaryPath) {
  const loadCommands = execFileSync("otool", ["-l", binaryPath], {
    encoding: "utf8",
  });
  if (loadCommands.includes(bundleLibraryRpath)) return;
  execFileSync("install_name_tool", [
    "-add_rpath",
    bundleLibraryRpath,
    binaryPath,
  ]);
}

async function findFiles(root, predicate) {
  const matches = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(path, predicate)));
    } else if (predicate(entry.name)) {
      matches.push(path);
    }
  }
  return matches;
}

async function main() {
  const targetArch = process.env.CLOUDEAI_TARGET_ARCH ?? process.arch;
  if (process.platform !== "darwin" || targetArch !== "arm64") {
    throw new Error(
      "CloudEAI's MVP build currently supports macOS on Apple Silicon only.",
    );
  }

  await mkdir(binaryDirectory, { recursive: true });
  try {
    const existing = await readFile(targetBinary);
    const digest = createHash("sha256").update(existing).digest("hex");
    if (digest === release.executableSha256) {
      ensureBundleRpath(targetBinary);
      return;
    }
  } catch {
    // Download below.
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "cloudeai-llama-"));
  const archivePath = join(temporaryDirectory, release.archive);
  const url = `https://github.com/ggml-org/llama.cpp/releases/download/${release.tag}/${release.archive}`;

  try {
    process.stdout.write(`Downloading llama.cpp ${release.tag} for Apple Silicon…\n`);
    const response = await fetch(url, {
      headers: { "User-Agent": "CloudEAI-build" },
    });
    if (!response.ok) {
      throw new Error(`llama.cpp download failed with HTTP ${response.status}.`);
    }

    const archiveBytes = new Uint8Array(await response.arrayBuffer());
    const digest = createHash("sha256").update(archiveBytes).digest("hex");
    if (digest !== release.sha256) {
      throw new Error("llama.cpp archive checksum did not match the pinned release.");
    }
    await writeFile(archivePath, archiveBytes);

    const extractedDirectory = join(temporaryDirectory, "extracted");
    await mkdir(extractedDirectory);
    execFileSync("tar", ["-xzf", archivePath, "-C", extractedDirectory], {
      stdio: "inherit",
    });

    const serverCandidates = await findFiles(
      extractedDirectory,
      (name) => name === "llama-server",
    );
    if (serverCandidates.length !== 1) {
      throw new Error("Could not identify llama-server in the release archive.");
    }

    await copyFile(serverCandidates[0], targetBinary);
    await chmod(targetBinary, 0o755);
    ensureBundleRpath(targetBinary);

    const libraries = await findFiles(
      extractedDirectory,
      (name) => name.endsWith(".dylib"),
    );
    for (const library of libraries) {
      const name = library.split("/").at(-1);
      if (!name) continue;
      await copyFile(library, join(binaryDirectory, name));
    }

    const manifest = {
      release: release.tag,
      archive: release.archive,
      archiveSha256: release.sha256,
      executableSha256: createHash("sha256")
        .update(await readFile(targetBinary))
        .digest("hex"),
      libraries: libraries.map((path) => path.split("/").at(-1)),
    };
    await writeFile(
      join(binaryDirectory, "llama-sidecar-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
