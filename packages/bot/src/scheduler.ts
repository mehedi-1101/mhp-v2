/**
 * Summary Scheduler Lambda
 *
 * Triggered by EventBridge at 9 PM Asia/Dhaka (cutoff time).
 * Creates a SummaryJob for tomorrow and pushes it to the SQS queue.
 * The Worker Lambda processes it and posts results to Discord + GChat.
 *
 * Generates for TOMORROW because 9 PM is the cutoff — participation
 * records for the next day are final at this point.
 */

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from "crypto";
import { TIMEZONE } from "@mhp/core";
import type { SummaryJob } from "@mhp/core";
import { putSummaryJob } from "./db/summaryJobs.js";

const sqsClient = new SQSClient({});

export async function handler(): Promise<void> {
  const QUEUE_URL = process.env.SUMMARY_QUEUE_URL;
  if (!QUEUE_URL) {
    throw new Error("SUMMARY_QUEUE_URL is not set");
  }

  // At 9 PM cutoff, generate the summary for tomorrow's meals.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  const date = d.toISOString().slice(0, 10);

  const jobId = randomUUID();
  const now = new Date().toISOString();

  const job: SummaryJob = {
    PK: `JOB#${date}`,
    SK: jobId,
    entityType: "JOB",
    date,
    jobId,
    status: "PENDING",
    result: null,
    errorMessage: null,
    triggeredBy: "scheduler",
    createdAt: now,
    updatedAt: now,
  };

  await putSummaryJob(job);

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify({ date, jobId }),
    })
  );

  console.log(JSON.stringify({ event: "scheduler_triggered", date, jobId }));
}
