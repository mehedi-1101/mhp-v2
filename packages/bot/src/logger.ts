/**
 * Structured JSON logging utility.
 *
 * All log output goes to stdout as JSON lines, which CloudWatch Logs
 * ingests automatically. CloudWatch Insights can then query by any field
 * (discordId, command, responseType, etc.) without parsing free-form text.
 */

export type ResponseType = "success" | "error" | "permission_denied" | "not_registered" | "ping";

export interface LogEntry {
  timestamp: string;
  discordId: string;
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
  discordId: string,
  userId: string | "unregistered",
  teamId: string | null,
  command: string,
  subcommand: string | null,
  responseType: ResponseType,
  startedAt?: number
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    discordId,
    userId,
    teamId,
    command,
    subcommand,
    responseType,
    ...(startedAt !== undefined ? { durationMs: Date.now() - startedAt } : {}),
  };
}
