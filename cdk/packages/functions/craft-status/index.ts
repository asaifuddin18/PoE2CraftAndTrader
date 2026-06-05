/**
 * API Gateway (HTTP API) → polls a Standard state-machine execution.
 *
 * Route: GET /status?executionArn=...   (protected by the Lambda authorizer)
 * Returns: { status, output? , error? }
 *   - RUNNING                          → keep polling
 *   - SUCCEEDED + output (SolverOutput) → render
 *   - FAILED/TIMED_OUT/ABORTED + error  → show error
 */
import { SFNClient, DescribeExecutionCommand } from "@aws-sdk/client-sfn";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

const sfn = new SFNClient({ region: process.env.AWS_REGION });

const CORS = {
  "Access-Control-Allow-Origin": process.env.CORS_ORIGIN ?? "*",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
  "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext?.http?.method === "OPTIONS") return reply(204, {});

  const executionArn = event.queryStringParameters?.executionArn;
  if (!executionArn) return reply(400, { error: "executionArn required" });

  try {
    const res = await sfn.send(new DescribeExecutionCommand({ executionArn }));
    switch (res.status) {
      case "SUCCEEDED":
        return reply(200, { status: "SUCCEEDED", output: JSON.parse(res.output ?? "{}") });
      case "RUNNING":
        return reply(200, { status: "RUNNING" });
      default: // FAILED | TIMED_OUT | ABORTED
        return reply(200, { status: res.status, error: res.error ?? res.cause ?? "Solver failed" });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[craft-status] ERROR:", msg);
    return reply(500, { error: msg });
  }
}
