import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { auditedDerivedAuthorization } from "../_shared/authorizeDerivedOperation.js";

/**
 * Fire-and-forget trigger: dispatch GitHub Actions workflow `pli-adjudicate.yml`
 * when White Cell marks an action complete.
 *
 * Secrets (Supabase Edge Function):
 *   GITHUB_PAT  — fine-grained or classic PAT with actions:write on Fractured-Order
 *   GITHUB_REPO — owner/name, e.g. ssgwm25/Fractured-Order (optional; has default)
 */

const ALLOWED_ORIGINS = new Set([
  "https://ssgwm25.github.io",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:4174",
]);

const DEFAULT_REPO = "ssgwm25/Fractured-Order";
const WORKFLOW_FILE = "pli-adjudicate.yml";
const WORKFLOW_REF = "main";

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

  let payload: { sessionId?: string; dryRun?: boolean } = {};
  try {
    payload = await req.json();
  } catch (_error) {
    return jsonResponse({ error: "Invalid JSON body" }, 400, origin);
  }

  const sessionId = String(payload.sessionId || "").trim();
  if (!sessionId) {
    return jsonResponse({ error: "sessionId is required" }, 400, origin);
  }
  if (!isUuid(sessionId)) {
    return jsonResponse({ error: "sessionId must be a UUID" }, 400, origin);
  }

  const authorization = await auditedDerivedAuthorization({
    deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
    supabaseUrl: Deno.env.get("SUPABASE_URL"), anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
    authorization: authHeader, sessionId, operation: "adjudicate",
  });
  if (!authorization.allowed) {
    const denied = jsonResponse({ error: "Session operation is not authorized" }, 403, origin);
    denied.headers.set("x-gc03-request-id", authorization.requestId);
    return denied;
  }

  const dryRun = payload.dryRun === true;
  const githubPat = Deno.env.get("GITHUB_PAT") || Deno.env.get("GH_PAT") || "";
  const githubRepo = (Deno.env.get("GITHUB_REPO") || DEFAULT_REPO).trim();

  if (!githubPat) {
    return jsonResponse({
      error: "GITHUB_PAT is not configured on the server",
    }, 503, origin);
  }

  if (!/^[^/]+\/[^/]+$/.test(githubRepo)) {
    return jsonResponse({ error: "GITHUB_REPO must be owner/name" }, 500, origin);
  }

  const url =
    `https://api.github.com/repos/${githubRepo}/actions/workflows/${WORKFLOW_FILE}/dispatches`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubPat}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "fractured-order-trigger-pli-adjudication",
      },
      body: JSON.stringify({
        ref: WORKFLOW_REF,
        inputs: {
          session_id: sessionId,
          dry_run: dryRun ? "true" : "false",
        },
      }),
    });

    if (response.status === 204) {
      return jsonResponse({
        ok: true,
        dispatched: true,
        repo: githubRepo,
        workflow: WORKFLOW_FILE,
        sessionId,
        dryRun,
      }, 200, origin);
    }

    const detail = (await response.text()).slice(0, 500);
    console.error("GitHub workflow_dispatch failed", response.status, detail);
    return jsonResponse({
      error: "GitHub workflow_dispatch failed",
      status: response.status,
      detail,
    }, response.status >= 400 && response.status < 600 ? response.status : 502, origin);
  } catch (error) {
    console.error("trigger-pli-adjudication failed", error);
    const message = error instanceof Error ? error.message : "PLI trigger failed";
    return jsonResponse({ error: message }, 500, origin);
  }
});
