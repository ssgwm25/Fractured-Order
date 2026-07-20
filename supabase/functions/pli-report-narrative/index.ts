import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ALLOWED_ORIGINS = new Set([
  "https://ssgwm25.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

const MAX_FACT_PACK_CHARS = 80000;
const ALLOWED_SCOPES = new Set(["action", "move", "simulation"]);
const CURSOR_API_BASE = "https://api.cursor.com/v1";
const DEFAULT_MODEL = "grok-4.5";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 45; // ~90s wall clock

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://ssgwm25.github.io";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json",
      Connection: "keep-alive",
    },
  });
}

function cursorAuthHeader(apiKey: string): string {
  const token = btoa(`${apiKey}:`);
  return `Basic ${token}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cursorFetch(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${CURSOR_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: cursorAuthHeader(apiKey),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function waitForRunResult(
  apiKey: string,
  agentId: string,
  runId: string,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await cursorFetch(`/agents/${agentId}/runs/${runId}`, apiKey);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Cursor run poll failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    const run = await response.json();
    const status = String(run?.status || "").toUpperCase();

    if (status === "FINISHED" || status === "COMPLETED" || status === "SUCCESS") {
      const narrative = String(run?.result || "").trim();
      if (!narrative) {
        throw new Error("Cursor agent finished without a narrative result");
      }
      return narrative;
    }

    if (status === "ERROR" || status === "FAILED" || status === "CANCELLED") {
      throw new Error(`Cursor agent run ended with status ${status}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Cursor agent run timed out waiting for narrative");
}

async function archiveAgent(apiKey: string, agentId: string): Promise<void> {
  try {
    await cursorFetch(`/agents/${agentId}/archive`, apiKey, { method: "POST" });
  } catch (error) {
    console.error("Failed to archive Cursor agent", agentId, error);
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authorization required" }, 401, origin);
  }

  let payload: {
    sessionId?: string;
    scope?: string;
    factPack?: unknown;
  };

  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin);
  }

  const sessionId = String(payload.sessionId || "").trim();
  const scope = String(payload.scope || "").trim();
  const factPack = payload.factPack;

  if (!sessionId) {
    return jsonResponse({ error: "sessionId is required" }, 400, origin);
  }
  if (!ALLOWED_SCOPES.has(scope)) {
    return jsonResponse({ error: "scope must be action, move, or simulation" }, 400, origin);
  }
  if (!factPack || typeof factPack !== "object") {
    return jsonResponse({ error: "factPack is required" }, 400, origin);
  }

  const serialized = JSON.stringify(factPack);
  if (!serialized || serialized === "{}") {
    return jsonResponse({ error: "factPack is empty" }, 400, origin);
  }
  if (serialized.length > MAX_FACT_PACK_CHARS) {
    return jsonResponse({ error: "factPack is too large" }, 413, origin);
  }

  const apiKey = Deno.env.get("CURSOR_API_KEY");
  if (!apiKey) {
    return jsonResponse({
      error: "CURSOR_API_KEY is not configured on the server",
    }, 503, origin);
  }

  const modelId = Deno.env.get("PLI_AGENT_MODEL")
    || Deno.env.get("CURSOR_AGENT_MODEL")
    || DEFAULT_MODEL;

  const promptText = [
    "You write concise after-action narrative summaries for White Cell exercise facilitators.",
    "Ground every claim only in the provided PLI fact pack.",
    "Do not invent indicators, NI deltas, Glasl stages, diplomacy codes, or outcomes.",
    "If a track is missing, omit it rather than guessing.",
    "Write 200–400 words of clear prose suitable for a PDF footer.",
    "Use a professional, neutral tone. No markdown headings. Paragraphs only.",
    "Do not edit files, run tools, or explore a repository. Reply with the narrative text only.",
    "",
    `Report scope: ${scope}`,
    `Session ID: ${sessionId}`,
    "",
    "Finalized PLI fact pack (JSON):",
    serialized,
  ].join("\n");

  let agentId: string | null = null;

  try {
    // No-repo cloud agent: prompt-only after-action narrative (no git workspace needed).
    const createResponse = await cursorFetch("/agents", apiKey, {
      method: "POST",
      body: JSON.stringify({
        name: `PLI report narrative (${scope})`,
        model: { id: modelId },
        prompt: { text: promptText },
      }),
    });

    if (!createResponse.ok) {
      const detail = await createResponse.text();
      console.error("Cursor create agent failed", createResponse.status, detail.slice(0, 500));
      return jsonResponse({
        error: "Cursor narrative agent request failed",
        status: createResponse.status,
        detail: detail.slice(0, 300),
      }, 502, origin);
    }

    const created = await createResponse.json();
    agentId = String(created?.agent?.id || created?.id || "").trim() || null;
    const runId = String(
      created?.run?.id
        || created?.agent?.latestRunId
        || created?.latestRunId
        || "",
    ).trim();

    if (!agentId || !runId) {
      return jsonResponse({
        error: "Cursor agent create response missing agent/run ids",
      }, 502, origin);
    }

    const narrative = await waitForRunResult(apiKey, agentId, runId);
    await archiveAgent(apiKey, agentId);

    return jsonResponse({ narrative, model: modelId }, 200, origin);
  } catch (error) {
    console.error("pli-report-narrative failed", error);
    if (agentId) {
      await archiveAgent(apiKey, agentId);
    }
    const message = error instanceof Error ? error.message : "Narrative generation failed";
    const timedOut = /timed out/i.test(message);
    return jsonResponse({ error: message }, timedOut ? 504 : 500, origin);
  }
});
