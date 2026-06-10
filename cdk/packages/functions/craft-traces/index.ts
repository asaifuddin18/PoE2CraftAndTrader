import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { readTraceArchive } from "../shared/loaders";
import type { SimulationTrace } from "../shared/types";

const CORS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
  "Content-Type": "application/json",
};

const reply = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: CORS,
  body: JSON.stringify(body),
});

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === "OPTIONS") return reply(204, {});

  let request: { traceKey?: string; filters?: Record<string, number> };
  try {
    request = JSON.parse(event.body ?? "{}");
  } catch {
    return reply(400, { error: "Invalid JSON body" });
  }
  if (!request.traceKey?.startsWith("traces/")) return reply(400, { error: "Valid traceKey required" });

  try {
    const archive = await readTraceArchive(request.traceKey);
    const filters = request.filters ?? {};
    const traces = archive.traces.filter(trace => matches(trace, filters, archive.preferences));
    if (traces.length > 10) {
      return reply(409, { error: "Narrow the outcome filter to 10 or fewer items", count: traces.length });
    }
    return reply(200, { count: traces.length, traces });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[craft-traces] ERROR:", message);
    return reply(500, { error: message });
  }
}

function matches(
  trace: SimulationTrace,
  filters: Record<string, number>,
  preferences: { modId: string; group: string }[],
): boolean {
  const mods = [...trace.finalItem.prefixes, ...trace.finalItem.suffixes];
  return Object.entries(filters).every(([modId, maximumTier]) => {
    if (!maximumTier) return true;
    const group = preferences.find(preference => preference.modId === modId)?.group;
    const rolled = mods.find(mod => mod.group === group);
    return Boolean(rolled && rolled.tier <= maximumTier);
  });
}
