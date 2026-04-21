/**
 * Summary Worker Lambda
 * 
 * Consumes SQS messages, computes headcount, posts to Discord + GChat, updates job status.
 */

import type { SQSEvent, SQSHandler } from "aws-lambda";
import { computeHeadcount, getAvailableMeals } from "@mhp/core";
import { getSettings } from "./db/settings.js";
import { getSpecialDay } from "./db/specialDays.js";
import { getAllUsers } from "./db/users.js";
import { getAllParticipationForDate } from "./db/meals.js";
import { getAllLocationsForDate } from "./db/locations.js";
import { getSummaryJob, putSummaryJob } from "./db/summaryJobs.js";
import { formatHeadcountReport } from "./formatter.js";

const DISCORD_CHANNEL_ID = process.env.DISCORD_SUMMARY_CHANNEL_ID;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GCHAT_WEBHOOK_URL = process.env.GCHAT_SUMMARY_WEBHOOK_URL;

interface SQSMessageBody {
  date: string;
  jobId: string;
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const body: SQSMessageBody = JSON.parse(record.body);
    await processSummaryJob(body.date, body.jobId);
  }
};

async function processSummaryJob(date: string, jobId: string): Promise<void> {
  const job = await getSummaryJob(date, jobId);
  if (!job) {
    console.error(`Job not found: ${jobId} for date ${date}`);
    return;
  }

  if (job.status !== "PENDING") {
    console.log(`Job ${jobId} already processed (status: ${job.status})`);
    return;
  }

  job.status = "PROCESSING";
  job.updatedAt = new Date().toISOString();
  await putSummaryJob(job);

  try {
    const [specialDay, settings, allUsers, participationRecords, locationRecords] =
      await Promise.all([
        getSpecialDay(date),
        getSettings(),
        getAllUsers(),
        getAllParticipationForDate(date),
        getAllLocationsForDate(date),
      ]);

    if (!settings) {
      throw new Error("Settings not found");
    }

    const availableMeals = getAvailableMeals(date, specialDay, settings);

    if (availableMeals.length === 0) {
      job.status = "READY";
      job.result = { date, formattedMessage: `No meals on ${date}.` };
      job.updatedAt = new Date().toISOString();
      await putSummaryJob(job);
      return;
    }

    const report = computeHeadcount(
      date,
      availableMeals,
      allUsers,
      participationRecords,
      locationRecords,
      settings
    );

    const message = formatHeadcountReport(report);

    await Promise.all([
      postToDiscord(message),
      postToGChat(message),
    ]);

    job.status = "READY";
    job.result = { date, formattedMessage: message };
    job.updatedAt = new Date().toISOString();
    await putSummaryJob(job);

    console.log(`Summary job ${jobId} completed for ${date}`);
  } catch (error) {
    job.status = "FAILED";
    job.errorMessage = error instanceof Error ? error.message : String(error);
    job.updatedAt = new Date().toISOString();
    await putSummaryJob(job);
    console.error(`Summary job ${jobId} failed:`, error);
  }
}

async function postToDiscord(message: string): Promise<void> {
  if (!DISCORD_CHANNEL_ID || !DISCORD_BOT_TOKEN) {
    console.warn("Discord channel ID or bot token not configured, skipping Discord post");
    return;
  }

  const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: message }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord API error (${response.status}): ${body}`);
  }
}

async function postToGChat(message: string): Promise<void> {
  if (!GCHAT_WEBHOOK_URL) {
    console.warn("GChat webhook URL not configured, skipping GChat post");
    return;
  }

  const response = await fetch(GCHAT_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GChat webhook error (${response.status}): ${body}`);
  }
}
