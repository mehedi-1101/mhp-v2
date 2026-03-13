/**
 * Role-based access control helpers.
 *
 * Pure functions — no I/O, no side effects.
 * The bot router calls requireRole() before dispatching to any command handler.
 */

import type { User, Role } from "./types.js";

/**
 * Returns true if the user's role is in the list of allowed roles.
 *
 * Usage:
 *   if (!requireRole(user, "ADMIN", "LOGISTICS")) {
 *     return ephemeralReply("Permission denied.");
 *   }
 */
export function requireRole(user: User, ...allowedRoles: Role[]): boolean {
  return allowedRoles.includes(user.role);
}
