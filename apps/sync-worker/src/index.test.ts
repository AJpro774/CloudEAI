import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { unstable_dev, type Unstable_DevWorker } from "wrangler";

const workerDirectory = dirname(fileURLToPath(import.meta.url));

function randomToken(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

describe("CloudEAI sync worker", () => {
  let worker: Unstable_DevWorker;
  const persistTo = mkdtempSync(join(tmpdir(), "cloudeai-worker-test-"));

  beforeAll(async () => {
    execFileSync(
      "npx",
      [
        "wrangler",
        "d1",
        "migrations",
        "apply",
        "cloudeai-sync",
        "--local",
        "--persist-to",
        persistTo,
      ],
      { cwd: join(workerDirectory, ".."), stdio: "pipe" },
    );

    worker = await unstable_dev("src/index.ts", {
      config: "wrangler.jsonc",
      ip: "127.0.0.1",
      port: 8799,
      persistTo,
      experimental: { disableExperimentalWarning: true },
    });
  }, 60_000);

  afterAll(async () => {
    await worker?.stop();
  });

  async function request(path: string, init?: RequestInit): Promise<Response> {
    return worker.fetch(`http://example.com${path}`, init);
  }

  it("reports health and the pinned Gemini model", async () => {
    const response = await request("/health");
    const body = (await response.json()) as {
      ok?: boolean;
      model?: string;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.model).toBe("gemini-3.7-flash");
  });

  it("rejects an invalid chat payload", async () => {
    const response = await request("/v1/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "short", messages: [] }),
    });
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/invalid chat request/i);
  });

  it("creates, stores, restores, and deletes an encrypted sync document", async () => {
    const accountId = randomToken(18);
    const authToken = randomToken(32);
    const created = await request("/v1/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, authToken }),
    });
    expect(created.status).toBe(201);

    const headers = {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
      "X-CloudEAI-Account": accountId,
    };
    const envelope = {
      version: 1,
      algorithm: "AES-GCM",
      iv: randomToken(12),
      ciphertext: randomToken(48),
      updatedAt: new Date().toISOString(),
    };

    const uploaded = await request("/v1/sync", {
      method: "PUT",
      headers,
      body: JSON.stringify({ baseRevision: 0, envelope }),
    });
    const uploadedBody = (await uploaded.json()) as { serverRevision?: number };
    expect(uploaded.status).toBe(200);
    expect(uploadedBody.serverRevision).toBe(1);

    const downloaded = await request("/v1/sync", { headers });
    const downloadedBody = (await downloaded.json()) as {
      envelope?: { ciphertext?: string };
      serverRevision?: number;
    };
    expect(downloaded.status).toBe(200);
    expect(downloadedBody.serverRevision).toBe(1);
    expect(downloadedBody.envelope?.ciphertext).toBe(envelope.ciphertext);

    const removed = await request("/v1/accounts", {
      method: "DELETE",
      headers,
    });
    expect(removed.status).toBe(200);

    const missing = await request("/v1/sync", { headers });
    expect(missing.status).toBe(401);
  });
});
