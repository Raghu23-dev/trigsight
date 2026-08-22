import { Tools, TOOL_SCHEMAS, type Doc } from "../../../lib/mcp/tools";
import { projects, work } from "../../../lib/content";

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
// Server identity is deliberately absent. The 2026-07-28 revision removed the `initialize`
// handshake, which was the only place a server announced its own name and version — so a
// SERVER constant here would be dead weight advertising a capability the revision deleted.

/**
 * Conformance note.
 *
 * This route was originally written from summary notes and violated 6 of 8 MUST
 * requirements of revision 2026-07-28 — found by auditing it with mcpgantlet, not by
 * review. The violations were: GET returned content instead of 405, a POST without
 * MCP-Protocol-Version was accepted, a header contradicting the body was accepted, an
 * unknown method returned 200 instead of 404/-32601, `initialize` was answered while
 * advertising a revision that removed it, and a notification returned 200 instead of 202.
 *
 * Each rule below cites its clause so the next reader can check the claim rather than
 * trust this comment.
 */
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_HEADER_MISMATCH = -32020;

let tools: Tools | null = null;

function getTools(origin: string): Tools {
  if (tools !== null) return tools;
  // Projects first, then work. `find_evidence` and `check_stack` search this list, so an agent
  // asking whether a claim is supported should hit the independently verifiable material before
  // the generically described employer work.
  const docs: Doc[] = [...projects, ...work].map((d) => ({
    id: d.id,
    title: d.title,
    path: d.path,
    summary: d.summary,
    category: d.category,
    period: d.period,
    stack: d.stack,
    metrics: d.metrics,
    // Velite's build output, not the filesystem — see the chat route for why.
    body: d.raw,
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
  const method = typeof body.method === "string" ? body.method : "";

  // Every POST MUST carry MCP-Protocol-Version, and it MUST match the body's _meta.
  // Spec: Request Metadata / Protocol Version Header.
  const versionHeader = request.headers.get("mcp-protocol-version");
  if (versionHeader === null) {
    return rpcError(
      id,
      JSONRPC_HEADER_MISMATCH,
      "missing required MCP-Protocol-Version header",
      400,
    );
  }
  const bodyVersion = (body.params?._meta as Record<string, unknown> | undefined)?.[
    "io.modelcontextprotocol/protocolVersion"
  ];
  if (typeof bodyVersion === "string" && bodyVersion !== versionHeader) {
    return rpcError(
      id,
      JSONRPC_HEADER_MISMATCH,
      `MCP-Protocol-Version header ${versionHeader} does not match body value ${bodyVersion}`,
      400,
    );
  }
  if (versionHeader !== PROTOCOL_VERSION) {
    return rpcError(
      id,
      JSONRPC_HEADER_MISMATCH,
      `unsupported protocol version ${versionHeader}`,
      400,
      { supported: [PROTOCOL_VERSION] },
    );
  }

  // Mcp-Method and Mcp-Name mirror body fields. A mismatch is a security issue per the
  // spec's own reasoning: an intermediary may route on the header while the server
  // executes on the body. Spec: Server Validation, error -32020.
  const methodHeader = request.headers.get("mcp-method");
  if (methodHeader !== null && methodHeader !== method) {
    return rpcError(
      id,
      JSONRPC_HEADER_MISMATCH,
      `Mcp-Method header ${methodHeader} does not match body method ${method}`,
      400,
    );
  }
  const nameHeader = decodeHeaderValue(request.headers.get("mcp-name"));
  const bodyName = body.params?.name ?? body.params?.uri;
  if (nameHeader !== null && typeof bodyName === "string" && nameHeader !== bodyName) {
    return rpcError(
      id,
      JSONRPC_HEADER_MISMATCH,
      `Mcp-Name header ${nameHeader} does not match body value ${bodyName}`,
      400,
    );
  }

  // A notification has no id, so there is nowhere to put a response body.
  // Spec: Sending Messages 5 — accepted notification returns 202 with no body.
  if (body.id === undefined || body.id === null) {
    return new Response(null, { status: 202 });
  }

  switch (method) {
    // `initialize` was REMOVED in this revision. Answering it while advertising
    // 2026-07-28 would claim a version this server does not implement, so it is
    // treated as an unknown method like any other.
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
      // An unknown method MUST be 404 with -32601, so a client can distinguish a
      // modern server from a legacy one that does not host this endpoint.
      return rpcError(id, JSONRPC_METHOD_NOT_FOUND, `Method not found: ${method}`, 404);
  }
}

/** Decode the spec's Base64 sentinel form: `=?base64?...?=`. */
function decodeHeaderValue(raw: string | null): string | null {
  if (raw === null) return null;
  const m = /^=\?base64\?(.*)\?=$/.exec(raw);
  if (m?.[1] === undefined) return raw;
  try {
    return Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return raw;
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

/**
 * JSON-RPC error with an explicit HTTP status.
 *
 * The status is a parameter rather than always 200 because this revision requires
 * specific pairings: 404 for an unknown method, 400 for header validation. Both carry a
 * JSON-RPC error body so a client can tell them apart from a transport-level failure.
 */
function rpcError(
  id: string | number | null,
  code: number,
  message: string,
  status = 200,
  data?: Record<string, unknown>,
): Response {
  const error: Record<string, unknown> = { code, message };
  if (data) error.data = data;
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * GET must be 405.
 *
 * Revision 2026-07-28 removed the GET stream endpoint, and the spec directs a
 * server that supports only this revision to answer GET with 405. Returning a
 * discovery document instead — which this route originally did — signals an older
 * revision and causes a client to negotiate down.
 *
 * Discovery lives at /api/mcp/info, where it is useful to a human without
 * misleading a protocol client.
 */
export function GET(): Response {
  return new Response(null, {
    status: 405,
    headers: { allow: "POST", "content-type": "application/json; charset=utf-8" },
  });
}

/** DELETE terminated a session in earlier revisions. Sessions no longer exist. */
export function DELETE(): Response {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
