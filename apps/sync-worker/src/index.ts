import {
  CLOUD_LIMITS,
  GEMINI_MODEL,
  type ChatRequest,
  type ModelMessage,
} from "@cloudeai/shared";

const MAX_DOCUMENT_BYTES = 900_000;
const encoder = new TextEncoder();

type AccountBody = {
  accountId?: unknown;
  authToken?: unknown;
};

type SyncBody = {
  baseRevision?: unknown;
  envelope?: {
    version?: unknown;
    algorithm?: unknown;
    iv?: unknown;
    ciphertext?: unknown;
    updatedAt?: unknown;
  };
};

type ChatBody = Partial<ChatRequest>;

type AuthenticatedAccount = {
  accountId: string;
};

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;

  const allowed = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim());
  return allowed.includes(origin) ? origin : null;
}

function corsHeaders(request: Request, env: Env): HeadersInit {
  const origin = allowedOrigin(request, env);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-CloudEAI-Account, X-CloudEAI-Device",
    "Access-Control-Allow-Methods": "DELETE, GET, OPTIONS, POST, PUT",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(
  request: Request,
  env: Env,
  body: unknown,
  status = 200,
  extraHeaders: HeadersInit = {},
): Response {
  return Response.json(body, {
    status,
    headers: {
      ...corsHeaders(request, env),
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function isBase64Url(value: string, min: number, max: number): boolean {
  return (
    value.length >= min &&
    value.length <= max &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function isIsoDate(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |=
      (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

async function readJson<T>(request: Request): Promise<T | null> {
  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (contentLength > MAX_DOCUMENT_BYTES * 1.5) return null;

  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function authenticate(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<AuthenticatedAccount | null> {
  const accountId = request.headers.get("X-CloudEAI-Account") ?? "";
  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!isBase64Url(accountId, 22, 64) || !isBase64Url(token, 32, 256)) {
    return null;
  }

  const row = await env.DB.prepare(
    "SELECT auth_hash FROM accounts WHERE account_id = ?",
  )
    .bind(accountId)
    .first<{ auth_hash: string }>();

  if (!row) return null;
  const candidateHash = await sha256Base64Url(token);
  if (!timingSafeEqual(row.auth_hash, candidateHash)) return null;

  ctx.waitUntil(
    env.DB.prepare(
      "UPDATE accounts SET last_seen_at = datetime('now') WHERE account_id = ?",
    )
      .bind(accountId)
      .run(),
  );

  return { accountId };
}

async function registerAccount(request: Request, env: Env): Promise<Response> {
  const body = await readJson<AccountBody>(request);
  const accountId = typeof body?.accountId === "string" ? body.accountId : "";
  const authToken = typeof body?.authToken === "string" ? body.authToken : "";

  if (
    !isBase64Url(accountId, 22, 64) ||
    !isBase64Url(authToken, 32, 256)
  ) {
    return json(request, env, { error: "Invalid account credentials." }, 400);
  }

  const authHash = await sha256Base64Url(authToken);
  const result = await env.DB.prepare(
    "INSERT OR IGNORE INTO accounts (account_id, auth_hash) VALUES (?, ?)",
  )
    .bind(accountId, authHash)
    .run();

  if (result.meta.changes !== 1) {
    return json(request, env, { error: "Account already exists." }, 409);
  }

  return json(request, env, { ok: true }, 201);
}

async function getSyncDocument(
  request: Request,
  env: Env,
  account: AuthenticatedAccount,
): Promise<Response> {
  const document = await env.DB.prepare(
    `SELECT version, algorithm, iv, ciphertext, client_updated_at, server_revision
     FROM sync_documents
     WHERE account_id = ?`,
  )
    .bind(account.accountId)
    .first<{
      version: number;
      algorithm: string;
      iv: string;
      ciphertext: string;
      client_updated_at: string;
      server_revision: number;
    }>();

  if (!document) {
    return json(request, env, { envelope: null, serverRevision: 0 });
  }

  return json(request, env, {
    envelope: {
      version: document.version,
      algorithm: document.algorithm,
      iv: document.iv,
      ciphertext: document.ciphertext,
      updatedAt: document.client_updated_at,
    },
    serverRevision: document.server_revision,
  });
}

async function putSyncDocument(
  request: Request,
  env: Env,
  account: AuthenticatedAccount,
): Promise<Response> {
  const body = await readJson<SyncBody>(request);
  const envelope = body?.envelope;
  const baseRevision =
    typeof body?.baseRevision === "number" ? body.baseRevision : -1;
  const ciphertext =
    typeof envelope?.ciphertext === "string" ? envelope.ciphertext : "";
  const iv = typeof envelope?.iv === "string" ? envelope.iv : "";
  const updatedAt =
    typeof envelope?.updatedAt === "string" ? envelope.updatedAt : "";

  if (
    !Number.isSafeInteger(baseRevision) ||
    baseRevision < 0 ||
    envelope?.version !== 1 ||
    envelope?.algorithm !== "AES-GCM" ||
    !isBase64Url(iv, 12, 64) ||
    !isBase64Url(ciphertext, 16, MAX_DOCUMENT_BYTES) ||
    !isIsoDate(updatedAt)
  ) {
    return json(request, env, { error: "Invalid encrypted document." }, 400);
  }

  if (encoder.encode(ciphertext).byteLength > MAX_DOCUMENT_BYTES) {
    return json(request, env, { error: "Encrypted history is too large." }, 413);
  }

  const nextRevision = baseRevision + 1;
  let changes = 0;

  if (baseRevision === 0) {
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO sync_documents
       (account_id, version, algorithm, iv, ciphertext, client_updated_at, server_revision)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        account.accountId,
        envelope.version,
        envelope.algorithm,
        iv,
        ciphertext,
        updatedAt,
        nextRevision,
      )
      .run();
    changes = result.meta.changes;
  } else {
    const result = await env.DB.prepare(
      `UPDATE sync_documents
       SET version = ?, algorithm = ?, iv = ?, ciphertext = ?,
           client_updated_at = ?, server_revision = ?, updated_at = datetime('now')
       WHERE account_id = ? AND server_revision = ?`,
    )
      .bind(
        envelope.version,
        envelope.algorithm,
        iv,
        ciphertext,
        updatedAt,
        nextRevision,
        account.accountId,
        baseRevision,
      )
      .run();
    changes = result.meta.changes;
  }

  if (changes !== 1) {
    const current = await env.DB.prepare(
      "SELECT server_revision FROM sync_documents WHERE account_id = ?",
    )
      .bind(account.accountId)
      .first<{ server_revision: number }>();
    return json(
      request,
      env,
      {
        error: "Sync conflict.",
        serverRevision: current?.server_revision ?? 0,
      },
      409,
    );
  }

  return json(request, env, { ok: true, serverRevision: nextRevision });
}

async function deleteAccount(
  request: Request,
  env: Env,
  account: AuthenticatedAccount,
): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sync_documents WHERE account_id = ?").bind(
      account.accountId,
    ),
    env.DB.prepare("DELETE FROM accounts WHERE account_id = ?").bind(
      account.accountId,
    ),
  ]);
  return json(request, env, { ok: true });
}

function isModelMessage(value: unknown): value is ModelMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { role?: unknown; content?: unknown };
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    candidate.content.length > 0 &&
    candidate.content.length <= CLOUD_LIMITS.maxMessageCharacters
  );
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function consumeCloudQuota(
  env: Env,
  usageKey: string,
  characters: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const minute = now.toISOString().slice(0, 16);
  const dailyLimit = positiveInteger(
    env.CLOUD_DAILY_REQUEST_LIMIT,
    CLOUD_LIMITS.requestsPerDay,
  );
  const characterLimit = positiveInteger(
    env.CLOUD_DAILY_CHARACTER_LIMIT,
    800_000,
  );

  const [minuteResult, dailyResult] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO cloud_rate_limits (usage_key, minute_window, request_count)
       VALUES (?, ?, 1)
       ON CONFLICT (usage_key, minute_window) DO UPDATE SET
         request_count = request_count + 1,
         updated_at = datetime('now')
       WHERE request_count < ?`,
    ).bind(
      usageKey,
      minute,
      CLOUD_LIMITS.requestsPerMinute,
    ),
    env.DB.prepare(
      `INSERT INTO cloud_usage
         (usage_key, usage_day, request_count, character_count)
       VALUES (?, ?, 1, ?)
       ON CONFLICT (usage_key, usage_day) DO UPDATE SET
         request_count = request_count + 1,
         character_count = character_count + excluded.character_count,
         updated_at = datetime('now')
       WHERE request_count < ?
         AND character_count + excluded.character_count <= ?`,
    ).bind(usageKey, day, characters, dailyLimit, characterLimit),
  ]);

  if (
    !minuteResult ||
    !dailyResult ||
    minuteResult.meta.changes !== 1 ||
    dailyResult.meta.changes !== 1
  ) {
    return { allowed: false, remaining: 0 };
  }

  const row = await env.DB.prepare(
    `SELECT request_count FROM cloud_usage
     WHERE usage_key = ? AND usage_day = ?`,
  )
    .bind(usageKey, day)
    .first<{ request_count: number }>();

  return {
    allowed: true,
    remaining: Math.max(0, dailyLimit - (row?.request_count ?? dailyLimit)),
  };
}

async function readLimitedText(
  response: Response,
  maxBytes = 8_192,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let bytes = 0;

  while (bytes < maxBytes) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    result += decoder.decode(chunk.value, { stream: true });
  }
  await reader.cancel();
  return result.slice(0, maxBytes);
}

async function streamCloudChat(request: Request, env: Env): Promise<Response> {
  const body = await readJson<ChatBody>(request);
  const deviceId =
    typeof body?.deviceId === "string" ? body.deviceId.trim() : "";
  const systemPrompt =
    typeof body?.systemPrompt === "string" ? body.systemPrompt.trim() : "";
  const temperature =
    typeof body?.temperature === "number" ? body.temperature : 0.4;
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  if (
    !/^[A-Za-z0-9_-]{16,128}$/.test(deviceId) ||
    systemPrompt.length < 20 ||
    systemPrompt.length > 24_000 ||
    !Number.isFinite(temperature) ||
    temperature < 0 ||
    temperature > 1.5 ||
    messages.length < 1 ||
    messages.length > CLOUD_LIMITS.maxMessages ||
    !messages.every(isModelMessage)
  ) {
    return json(request, env, { error: "Invalid chat request." }, 400);
  }

  const characterCount =
    systemPrompt.length +
    messages.reduce((total, message) => total + message.content.length, 0);
  if (characterCount > CLOUD_LIMITS.maxRequestCharacters) {
    return json(request, env, { error: "Chat context is too large." }, 413);
  }

  const clientAddress =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "local";
  // The device id supports client-side quota UX; the server keys enforcement to
  // the network address so reinstalling the app cannot reset the free allowance.
  const usageKey = await sha256Base64Url(`cloud:${clientAddress}`);
  const quota = await consumeCloudQuota(env, usageKey, characterCount);
  if (!quota.allowed) {
    return json(
      request,
      env,
      {
        error:
          "Cloud limit reached. Local Gemma remains available without limits.",
      },
      429,
      { "Retry-After": "60", "X-RateLimit-Remaining": "0" },
    );
  }

  if (!env.GEMINI_API_KEY) {
    return json(request, env, { error: "Cloud model is not configured." }, 503);
  }

  const model = env.GEMINI_MODEL || GEMINI_MODEL;
  const upstream = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: messages.map((message) => ({
          role: message.role === "assistant" ? "model" : "user",
          parts: [{ text: message.content }],
        })),
        generationConfig: {
          temperature,
          maxOutputTokens: 8_192,
        },
      }),
    },
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await readLimitedText(upstream);
    console.error(
      JSON.stringify({
        event: "gemini_error",
        status: upstream.status,
        detail: detail.slice(0, 500),
      }),
    );
    return json(
      request,
      env,
      { error: "Gemini could not complete this request." },
      502,
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      ...corsHeaders(request, env),
      "Cache-Control": "no-store",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-CloudEAI-Model": model,
      "X-RateLimit-Remaining": String(quota.remaining),
    },
  });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method === "OPTIONS") {
      if (request.headers.has("Origin") && !allowedOrigin(request, env)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json(request, env, {
        ok: true,
        service: "cloudeai-api",
        model: env.GEMINI_MODEL || GEMINI_MODEL,
      });
    }

    if (url.pathname === "/v1/chat" && request.method === "POST") {
      return streamCloudChat(request, env);
    }

    if (url.pathname === "/v1/accounts" && request.method === "POST") {
      return registerAccount(request, env);
    }

    if (
      url.pathname !== "/v1/sync" &&
      !(url.pathname === "/v1/accounts" && request.method === "DELETE")
    ) {
      return json(request, env, { error: "Not found." }, 404);
    }

    const account = await authenticate(request, env, ctx);
    if (!account) {
      return json(request, env, { error: "Unauthorized." }, 401);
    }

    if (url.pathname === "/v1/sync" && request.method === "GET") {
      return getSyncDocument(request, env, account);
    }
    if (url.pathname === "/v1/sync" && request.method === "PUT") {
      return putSyncDocument(request, env, account);
    }
    if (url.pathname === "/v1/accounts" && request.method === "DELETE") {
      return deleteAccount(request, env, account);
    }

    return json(
      request,
      env,
      { error: "Method not allowed." },
      405,
      { Allow: "DELETE, GET, OPTIONS, POST, PUT" },
    );
  },
} satisfies ExportedHandler<Env>;
