/**
 * /summary command — async summary generation.
 * 
 * Subcommands:
 *   - generate [date] — creates SummaryJob, pushes to SQS, returns immediately
 *   - status [date]   — queries latest SummaryJob for the date
 */

import type { CommandContext, CommandResult, SummaryJob } from "@mhp/core";
import { isValidDate, TIMEZONE } from "@mhp/core";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from "crypto";
import { getLatestSummaryJob, putSummaryJob } from "../db/summaryJobs.js";

const QUEUE_URL = process.env.SUMMARY_QUEUE_URL;
const sqsClient = new SQSClient({});

function resolveDate(arg: string | undefined): string {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });
  if (!arg || arg === "today") return today;
  if (arg === "tomorrow") {
    const d = new Date(today + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  return arg;
}

export async function handleSummary(ctx: CommandContext): Promise<CommandResult> {
  const { subcommand } = ctx;

  if (!subcommand || subcommand === "generate") {
    return handleGenerate(ctx);
  }

  if (subcommand === "status") {
    return handleStatus(ctx);
  }

  return { content: "Unknown subcommand. Use /summary generate or /summary status.", ephemeral: true };
}

async function handleGenerate(ctx: CommandContext): Promise<CommandResult> {
  const rawDate = ctx.args["date"] as string | undefined;
  const date = resolveDate(rawDate);

  if (!isValidDate(date)) {
    return { content: "Invalid date. Use YYYY-MM-DD format.", ephemeral: true };
  }

  if (!QUEUE_URL) {
    return { content: "Summary queue not configured. Contact an admin.", ephemeral: true };
  }

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
    triggeredBy: ctx.user.userId,
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

  return {
    content: `✅ Summary generation started for ${date}. I'll post the result to the summary channel when ready.`,
    ephemeral: false,
  };
}

async function handleStatus(ctx: CommandContext): Promise<CommandResult> {
  const rawDate = ctx.args["date"] as string | undefined;
  const date = resolveDate(rawDate);

  if (!isValidDate(date)) {
    return { content: "Invalid date. Use YYYY-MM-DD format.", ephemeral: true };
  }

  const job = await getLatestSummaryJob(date);

  if (!job) {
    return { content: `No summary job found for ${date}.`, ephemeral: true };
  }

  if (job.status === "PENDING" || job.status === "PROCESSING") {
    return { content: `Summary for ${date} is still processing...`, ephemeral: true };
  }

  if (job.status === "FAILED") {
    return {
      content: `Summary for ${date} failed: ${job.errorMessage ?? "Unknown error"}`,
      ephemeral: true,
    };
  }

  if (job.status === "READY" && job.result) {
    return { content: job.result.formattedMessage, ephemeral: true };
  }

  return { content: `Summary job status: ${job.status}`, ephemeral: true };
}
