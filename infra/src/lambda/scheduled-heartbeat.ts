import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

type ScheduledEvent = {
  id?: string;
  time?: string;
};

type LambdaContext = {
  awsRequestId?: string;
};

const client = new DynamoDBClient({});

export async function handler(event: ScheduledEvent, context: LambdaContext) {
  const tableName = requiredEnv("APP_TABLE_NAME");
  const stage = requiredEnv("APOTH_STAGE");
  const jobName = requiredEnv("JOB_NAME");
  const now = new Date().toISOString();
  const scheduledAt = validIsoOrFallback(event.time, now);
  const requestId = context.awsRequestId ?? event.id ?? "unknown";

  await client.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: {
        pk: { S: `STATUS#${jobName}` },
        sk: { S: "CURRENT" },
      },
      UpdateExpression: [
        "SET #recordType = :recordType",
        "#schemaVersion = :schemaVersion",
        "#createdAt = if_not_exists(#createdAt, :now)",
        "#updatedAt = :now",
        "#name = :name",
        "#status = :status",
        "#stage = :stage",
        "#jobName = :jobName",
        "#lastHeartbeatAt = :now",
        "#lastScheduledAt = :scheduledAt",
        "#lastRequestId = :requestId",
      ].join(", "),
      ExpressionAttributeNames: {
        "#recordType": "recordType",
        "#schemaVersion": "schemaVersion",
        "#createdAt": "createdAt",
        "#updatedAt": "updatedAt",
        "#name": "name",
        "#status": "status",
        "#stage": "stage",
        "#jobName": "jobName",
        "#lastHeartbeatAt": "lastHeartbeatAt",
        "#lastScheduledAt": "lastScheduledAt",
        "#lastRequestId": "lastRequestId",
      },
      ExpressionAttributeValues: {
        ":recordType": { S: "operationalStatus" },
        ":schemaVersion": { N: "1" },
        ":now": { S: now },
        ":name": { S: jobName },
        ":status": { S: "ok" },
        ":stage": { S: stage },
        ":jobName": { S: jobName },
        ":scheduledAt": { S: scheduledAt },
        ":requestId": { S: requestId },
      },
    }),
  );

  return {
    ok: true,
    jobName,
    status: "ok",
  };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function validIsoOrFallback(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}
