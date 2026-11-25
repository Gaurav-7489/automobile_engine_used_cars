import type { SqlClient } from "../db";
import type { TextMessage } from "./types";

/**
 * Saved staff-assistant conversations. A thread belongs to one member of one dealership: row-level security keeps
 * dealerships apart, and every statement here also matches the member, so a member can never read, continue or delete a
 * colleague's thread (an unknown or foreign id behaves exactly like a missing one).
 */
export const MAX_THREADS_PER_MEMBER = 50;
export const HISTORY_FOR_MODEL = 24;

export type ThreadSummary = { id: string; title: string; updatedAt: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validThreadId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export async function listThreads(c: SqlClient, tenantId: string, userId: string, limit = 20): Promise<ThreadSummary[]> {
  const rows = (await c.query("SELECT id, title, updated_at FROM intelligence_assistant_threads WHERE tenant_id = $1 AND user_id = $2 ORDER BY updated_at DESC LIMIT $3", [tenantId, userId, Math.min(50, Math.max(1, limit))])).rows as { id: string; title: string; updated_at: Date | string }[];
  return rows.map((r) => ({ id: String(r.id), title: r.title, updatedAt: new Date(r.updated_at).toISOString() }));
}

/** The last messages of a member's own thread, oldest first; null when it is not theirs or does not exist. */
export async function readThread(c: SqlClient, tenantId: string, userId: string, threadId: string, limit = HISTORY_FOR_MODEL): Promise<TextMessage[] | null> {
  if (!validThreadId(threadId)) return null;
  const owned = (await c.query("SELECT 1 FROM intelligence_assistant_threads WHERE tenant_id = $1 AND user_id = $2 AND id = $3", [tenantId, userId, threadId])).rows.length > 0;
  if (!owned) return null;
  const rows = (await c.query("SELECT role, content FROM (SELECT role, content, created_at FROM intelligence_assistant_messages WHERE tenant_id = $1 AND user_id = $2 AND thread_id = $3 ORDER BY created_at DESC LIMIT $4) m ORDER BY created_at", [tenantId, userId, threadId, limit])).rows as { role: "user" | "assistant"; content: string }[];
  return rows.map((r) => ({ role: r.role, content: r.content }));
}

/** Starts a thread titled from the first question, and keeps only the member's most recent threads. */
export async function createThread(c: SqlClient, tenantId: string, userId: string, firstQuestion: string): Promise<string> {
  const title = firstQuestion.replace(/\s+/g, " ").trim().slice(0, 80);
  const id = String((await c.query("INSERT INTO intelligence_assistant_threads(tenant_id, user_id, title) VALUES($1,$2,$3) RETURNING id", [tenantId, userId, title])).rows[0].id);
  await c.query("DELETE FROM intelligence_assistant_threads WHERE tenant_id = $1 AND user_id = $2 AND id IN (SELECT id FROM intelligence_assistant_threads WHERE tenant_id = $1 AND user_id = $2 ORDER BY updated_at DESC OFFSET $3)", [tenantId, userId, MAX_THREADS_PER_MEMBER]);
  return id;
}

export async function appendToThread(c: SqlClient, tenantId: string, userId: string, threadId: string, messages: TextMessage[]): Promise<boolean> {
  if (!validThreadId(threadId)) return false;
  const touched = await c.query("UPDATE intelligence_assistant_threads SET updated_at = now() WHERE tenant_id = $1 AND user_id = $2 AND id = $3 RETURNING id", [tenantId, userId, threadId]);
  if (!touched.rows.length) return false;
  for (const m of messages) {
    if (!m.content.trim()) continue;
    await c.query("INSERT INTO intelligence_assistant_messages(thread_id, tenant_id, user_id, role, content) VALUES($1,$2,$3,$4,$5)", [threadId, tenantId, userId, m.role, m.content.slice(0, 40000)]);
  }
  return true;
}

export async function deleteThread(c: SqlClient, tenantId: string, userId: string, threadId: string): Promise<boolean> {
  if (!validThreadId(threadId)) return false;
  return (await c.query("DELETE FROM intelligence_assistant_threads WHERE tenant_id = $1 AND user_id = $2 AND id = $3 RETURNING id", [tenantId, userId, threadId])).rows.length > 0;
}

/** Latest outcome of a real model call for this dealership, for the status display. */
export async function lastCall(c: SqlClient, tenantId: string): Promise<{ status: "ok" | "error"; errorKind: string | null; at: string } | null> {
  const r = (await c.query("SELECT status, error_kind, created_at FROM intelligence_ai_usage WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1", [tenantId])).rows[0] as { status: "ok" | "error"; error_kind: string | null; created_at: Date | string } | undefined;
  return r ? { status: r.status, errorKind: r.error_kind, at: new Date(r.created_at).toISOString() } : null;
}
