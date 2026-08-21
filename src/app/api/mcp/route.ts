import { Tools, TOOL_SCHEMAS, type Doc } from "../../../lib/mcp/tools";
import { work } from "../../../lib/content";

/**
 * MCP endpoint — stateless Streamable HTTP.
 *
 * Implemented directly against the JSON-RPC surface rather than through an SDK.
 * Reasons, in order:
 *
 * 1. The transport is now stateless: no sessions, no `initialize` handshake to
 *    persist, no SSE resumability. That removes the state management an SDK was
 *    mainly buying, leaving a single POST handler.
 * 2. No Redis and no durable storage, so nothing to provision and nothing to keep
 *    warm — which matters on a free tier.
 * 3. Every tool here is read-only over content already in the repo, so there is no
 *    auth model to get wrong.
 *
 * `readOnlyHint` is set on every tool. Without it, clients prompt the user for
 * confirmation on each call, which makes a read-only server feel dangerous.
 */

export const runtime = "nodejs";

const PROTOCOL_VERSION = "2026-07-28";
const SERVER = { name: "trigsight", version: "0.1.0" } as const;

let tools: Tools | null = null;

function getTools(origin: string): Tools {
  if (tools !== null) return tools;
  const docs: Doc[] = work.map((w) => ({
    id: w.id,
    title: w.title,
    path: w.path,
    summary: w.summary,
    category: w.category,
    period: w.period,
    stack: w.stack,
    metrics: w.metrics,
    // Velite's build output, not the filesystem — see the chat route for why.
    body: w.raw,
  }));
  tools = new Tools(docs, origin);
  return tools;
}

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export async function POST(request: Request): Promise<Response> {
  // Origin validation. An MCP endpoint reachable from a browser page is a DNS
  // rebinding target, so a request carrying a foreign Origin is refused. Requests
  // with no Origin (a CLI or server-side agent, the normal case) are allowed.
  const origin = request.headers.get("origin");
  if (origin !== null && !isAllowedOrigin(origin, request)) {
    return new Response(JSON.stringify({ error: "origin not allowed" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  let body: RpcRequest;
  try {
    body = (await request.json()) as RpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const id = body.id ?? null;
  const base = new URL(request.url).origin;

  switch (body.method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER,
        instructions:
          "Verification tools for one engineer's documented work. Prefer find_evidence over assuming a capability: it returns quoted passages with deep links, or states plainly that no evidence exists. Quote returned passages directly rather than paraphrasing them.",
      });

    // Stateless transport: no session to acknowledge, but clients still send this.
    case "notifications/initialized":
      return new Response(null, { status: 202 });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, { tools: TOOL_SCHEMAS });

    case "tools/call": {
      const name = String(body.params?.name ?? "");
      const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
      const t = getTools(base);

      try {
        const payload = await callTool(t, name, args);
        if (payload === undefined) {
          return rpcError(id, -32602, `Unknown tool: ${name}`);
        }
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          isError: false,
        });
      } catch (err) {
        // Tool failures are reported as results with isError, not as protocol
        // errors — the call succeeded, the tool did not.
        return rpcResult(id, {
          content: [
            { type: "text", text: err instanceof Error ? err.message : "tool failed" },
          ],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${String(body.method)}`);
  }
}

async function callTool(
  t: Tools,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "list_work":
      return t.listWork();
    case "find_evidence":
      return await t.findEvidence(
        String(args.claim ?? ""),
        typeof args.limit === "number" ? args.limit : 5,
      );
    case "check_stack":
      return t.checkStack(String(args.technology ?? ""));
    case "read_work":
      return t.readWork(String(args.docId ?? ""));
    default:
      return undefined;
  }
}

function isAllowedOrigin(origin: string, request: Request): boolean {
  try {
    const o = new URL(origin);
    const self = new URL(request.url);
    if (o.host === self.host) return true;
    return o.hostname === "localhost" || o.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function rpcResult(id: string | number | null, result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status: 200, // JSON-RPC errors travel in the body, not the HTTP status
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** GET returns discovery info rather than 404, so a curious human sees something useful. */
export function GET(): Response {
  return new Response(
    JSON.stringify(
      {
        server: SERVER,
        protocolVersion: PROTOCOL_VERSION,
        transport: "streamable-http (stateless)",
        usage: "POST JSON-RPC 2.0 to this endpoint. Call tools/list to enumerate tools.",
        tools: TOOL_SCHEMAS.map((t) => ({ name: t.name, description: t.description })),
      },
      null,
      2,
    ),
    { headers: { "content-type": "application/json; charset=utf-8" } },
  );
}
