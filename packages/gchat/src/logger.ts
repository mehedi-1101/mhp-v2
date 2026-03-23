/**
 * Structured JSON logging utility for the GChat Bot Lambda.
 *
 * Mirrors packages/bot/src/logger.ts but uses gchatUserId instead of discordId.
 * All output goes to stdout as JSON lines, ingested by CloudWatch Logs automatically.
 */

export type ResponseType = "success" | "error" | "permission_denied" | "not_registered";

export interface LogEntry {
  timestamp: string;
  gchatUserId: string;
  userId: string | "unregistered";
  teamId: string | null;
  command: string;
  subcommand: string | null;
  responseType: ResponseType;
  durationMs?: number;
}

export function log(entry: LogEntry): void {
  console.log(JSON.stringify(entry));
}

export function makeEntry(
  gchatUserId: string,
  userId: string | "unregistered",
  teamId: string | null,
  command: string,
  subcommand: string | null,
  responseType: ResponseType,
  startedAt?: number
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    gchatUserId,
    userId,
    teamId,
    command,
    subcommand,
    responseType,
    ...(startedAt !== undefined ? { durationMs: Date.now() - startedAt } : {}),
  };
}
