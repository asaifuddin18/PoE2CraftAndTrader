import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { readEvaluation, readTraceManifest } from "../shared/loaders";
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
    const manifest = await readTraceManifest(request.traceKey);
    if (!Array.isArray(manifest.resultKeys)) {
      return reply(410, { error: "This trace uses the previous archive format. Rerun the optimizer to inspect exact matches." });
    }
    const filters = request.filters ?? {};
    const traces: SimulationTrace[] = [];
    for (const resultKey of manifest.resultKeys) {
      const result = await readEvaluation(resultKey);
      for (const trace of result.traces) {
        if (!matches(trace, filters, manifest.preferences)) continue;
        traces.push(trace);
        if (traces.length > 10) {
          return reply(409, { error: "Narrow the outcome filter to 10 or fewer items", count: "more than 10" });
        }
      }
    }
    return reply(200, { count: traces.length, traces });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && (error.name === "NoSuchKey" || message.includes("NoSuchKey"))) {
      return reply(410, { error: "These exact traces have expired. Rerun the optimizer to inspect exact matches." });
    }
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
