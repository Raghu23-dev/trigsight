import { TOOL_SCHEMAS } from "../../../../lib/mcp/tools";

/**
 * Human-readable discovery.
 *
 * Split out from the MCP endpoint because that endpoint MUST answer GET with 405 —
 * returning a document there signals an older protocol revision and causes clients to
 * negotiate down.
 */
export function GET(): Response {
  return new Response(
    JSON.stringify(
      {
        server: { name: "trigsight", version: "0.1.0" },
        protocolVersion: "2026-07-28",
        transport: "streamable-http (stateless)",
        endpoint: "/api/mcp",
        usage: "POST JSON-RPC 2.0 with MCP-Protocol-Version and Mcp-Method headers.",
        tools: TOOL_SCHEMAS.map((t) => ({ name: t.name, description: t.description })),
      },
      null,
      2,
    ),
    { headers: { "content-type": "application/json; charset=utf-8" } },
  );
}
