/**
 * API Gateway (HTTP API) proxy → starts the Express state machine synchronously
 * and returns the aggregated SolverOutput.
 *
 * Route: POST /solve   (protected by the Lambda authorizer)
 */
import { randomUUID } from "node:crypto";
import { SFNClient, StartSyncExecutionCommand } from "@aws-sdk/client-sfn";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { SolveRequest } from "../shared/types";

const sfn = new SFNClient({ region: process.env.AWS_REGION });
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN ?? "";

const CORS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === "OPTIONS") return reply(204, {});

  let req: SolveRequest;
  try {
    req = JSON.parse(event.body ?? "{}");
  } catch {
    return reply(400, { error: "Invalid JSON body" });
  }
  if (!req.baseId)            return reply(400, { error: "baseId required" });
  if (!req.targetMods?.length) return reply(400, { error: "targetMods required" });

  const executionName = randomUUID();
  const input = {
    ...req,
    ilvl: Number(req.ilvl) || 84,
    mode: req.mode || "minTier",
    k_required: Number(req.k_required) || req.targetMods.length,
    executionName,
    startedAt: Date.now(),
  };

  try {
    const res = await sfn.send(new StartSyncExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: executionName,
      input: JSON.stringify(input),
    }));

    if (res.status !== "SUCCEEDED") {
      return reply(500, { error: `Solver ${res.status}: ${res.error ?? ""} ${res.cause ?? ""}`.trim() });
    }
    // Express sync output is a JSON string; pass it through as the SolverOutput.
    return reply(200, JSON.parse(res.output ?? "{}"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[craft-entry] ERROR:", msg);
    return reply(500, { error: msg });
  }
}
