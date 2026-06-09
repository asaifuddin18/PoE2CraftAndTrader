import { randomUUID } from "node:crypto";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { SolveRequest } from "../shared/types";

const sfn = new SFNClient({ region: process.env.AWS_REGION });
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN ?? "";
const CORS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
  "Content-Type": "application/json",
};
const reply = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({ statusCode, headers: CORS, body: JSON.stringify(body) });

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === "OPTIONS") return reply(204, {});
  let req: SolveRequest;
  try { req = JSON.parse(event.body ?? "{}"); } catch { return reply(400, { error: "Invalid JSON body" }); }
  if (!req.baseId) return reply(400, { error: "baseId required" });
  if (!req.preferences?.length) return reply(400, { error: "preferences required" });
  if (!req.budget?.amount || !["exalt", "divine"].includes(req.budget.unit)) return reply(400, { error: "valid budget required" });
  const executionName = randomUUID();
  try {
    const res = await sfn.send(new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: executionName,
      input: JSON.stringify({ ...req, ilvl: Number(req.ilvl) || 84, executionName, startedAt: Date.now() }),
    }));
    return reply(202, { executionArn: res.executionArn, status: "RUNNING" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[craft-entry] ERROR:", message);
    return reply(500, { error: message });
  }
}
