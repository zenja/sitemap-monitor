import { Hono } from "hono";
import { handle } from "hono/vercel";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { discover, rediscoverSite } from "@/lib/logic/discover";
import { enqueueScan, cronScan, startQueuedScans } from "@/lib/logic/scan";
import { getSiteDetail } from "@/lib/logic/site-detail";
import { resolveDb, type DatabaseClient } from "@/lib/db";
import {
  users,
  sites,
  changes,
  sitemaps,
  urls,
  scans,
  webhooks,
  notificationChannels,
  siteGroups,
} from "@/lib/drizzle/schema";
import { desc, and, eq, gte, lte, inArray, or, sql } from "drizzle-orm";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";
import type { SQL } from "drizzle-orm";

const randomUUID = () => crypto.randomUUID();

const app = new Hono<{
  Variables: { userId: string; userEmail?: string; requestId: string; db: DatabaseClient };
}>().basePath("/api");

app.post("/cron/scan", async (c) => {
  const expectedToken = process.env.CRON_TOKEN;
  if (expectedToken) {
    const authHeader = c.req.header("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : undefined;
    const queryToken = new URL(c.req.url).searchParams.get("token") ?? undefined;
    const headerToken = c.req.header("x-cron-token") ?? undefined;
    const provided = bearerToken ?? headerToken ?? queryToken ?? "";
    if (provided !== expectedToken) {
      return c.json({ error: "unauthorized" }, 401);
    }
  }

  // 支持通过查询参数限制扫描数量（可选）
  const maxParam = new URL(c.req.url).searchParams.get("max");
  const maxSites = maxParam ? parseInt(maxParam, 10) : undefined;

  const result = await cronScan(maxSites);
  return c.json(result);
});

app.post("/cron/cleanup", async (c) => {
  const expectedToken = process.env.CRON_TOKEN;
  if (expectedToken) {
    const authHeader = c.req.header("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : undefined;
    const queryToken = new URL(c.req.url).searchParams.get("token") ?? undefined;
    const headerToken = c.req.header("x-cron-token") ?? undefined;
    const provided = bearerToken ?? headerToken ?? queryToken ?? "";
    if (provided !== expectedToken) {
      return c.json({ error: "unauthorized" }, 401);
    }
  }

  // 清理卡住的扫描（可配置超时时间，默认 60 分钟）
  const db = resolveDb() as any;
  const now = Date.now();
  const timeoutMinutes = parseInt(new URL(c.req.url).searchParams.get("timeout") || "60", 10);
  const timeoutThreshold = new Date(now - timeoutMinutes * 60 * 1000);

  const runningScans = await db
    .select()
    .from(scans)
    .where(eq(scans.status, "running"));

  let cleanedCount = 0;
  for (const scan of runningScans) {
    if (scan.startedAt && new Date(scan.startedAt) < timeoutThreshold) {
      await db
        .update(scans)
        .set({
          status: "failed",
          finishedAt: new Date(),
          error: `Scan timeout - exceeded ${timeoutMinutes} minutes`,
        })
        .where(eq(scans.id, scan.id));
      cleanedCount++;
    }
  }

  return c.json({ 
    ok: true, 
    cleaned: cleanedCount,
    timeoutMinutes,
    message: `Cleaned up ${cleanedCount} stuck scans (timeout: ${timeoutMinutes} minutes)` 
  });
});

app.post("/cron/process-queue", async (c) => {
  const expectedToken = process.env.CRON_TOKEN;
  if (expectedToken) {
    const authHeader = c.req.header("authorization") ?? "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : undefined;
    const queryToken = new URL(c.req.url).searchParams.get("token") ?? undefined;
    const headerToken = c.req.header("x-cron-token") ?? undefined;
    const provided = bearerToken ?? headerToken ?? queryToken ?? "";
    if (provided !== expectedToken) {
      return c.json({ error: "unauthorized" }, 401);
    }
  }

  // 启动队列中的扫描任务（异步，快速返回）
  const maxParam = new URL(c.req.url).searchParams.get("max");
  const maxConcurrent = maxParam ? parseInt(maxParam, 10) : 3;

  const result = await startQueuedScans(maxConcurrent);
  return c.json(result);
});

app.use("*", async (c, next) => {
  const sessionId = getCookie(c, SESSION_COOKIE_NAME);
  if (!sessionId) return c.json({ error: "unauthorized" }, 401);

  const db = resolveDb() as any;
  const userRows = await (db as any)
    .select()
    .from(users)
    .where(eq(users.id, sessionId))
    .limit(1);
  const user = userRows[0] ? { id: userRows[0].id, email: userRows[0].email } : undefined;

  if (!user) return c.json({ error: "unauthorized" }, 401);

  c.set("userId", user.id);
  c.set("userEmail", user.email);
  c.set("db", db);
  await next();
}); app.
  post("/sites", async (c) => {
    const schema = z.object({
      rootUrl: z.string().url(),
      tags: z.array(z.string()).optional(),
    });
    const body = await c.req.json();
    const { rootUrl, tags } = schema.parse(body);
    const site = await discover({
      rootUrl,
      ownerId: c.get("userId"),
      tags: normalizeTagsList(tags),
    });
    return c.json(site, 201);
  });

app.get("/sites", async (c) => {
  const ownerId = c.get("userId");
  const db = c.get("db") ?? (resolveDb() as any);
  const rawRows = await (db as any)
    .select()
    .from(sites)
    .where(eq(sites.ownerId, ownerId))
    .orderBy(desc(sites.createdAt));

  const rows = rawRows.map((row: any) => ({
    id: row.id,
    rootUrl: row.rootUrl,
    robotsUrl: row.robotsUrl,
    enabled: row.enabled,
    tags: row.tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return c.json({
    sites: rows.map((row: any) => ({
      ...row,
      tags: safeParseTags(row.tags),
    })),
  });
});

app.patch("/sites/:id", async (c) => {
  const id = c.req.param("id");
  const ownerId = c.get("userId");
  const db = c.get("db") ?? (resolveDb() as any);
  const schema = z
    .object({
      rootUrl: z.string().url().optional(),
      enabled: z.boolean().optional(),
      tags: z.array(z.string()).optional(),
      scanPriority: z.number().int().min(1).max(5).optional(),
      scanIntervalMinutes: z.number().int().min(5).max(10080).optional(),
      groupId: z.string().min(1).optional().nullable(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "no updates provided",
    });
  const body = schema.parse(await c.req.json());
  const normalizedTags = normalizeTagsList(body.tags);

  const existingRows = await (db as any)
    .select()
    .from(sites)
    .where(eq(sites.id, id))
    .limit(1);
  const existing = existingRows[0];
  if (!existing || existing.ownerId !== ownerId)
    return c.json({ error: "not found" }, 404);

  if (body.rootUrl) {
    try {
      await rediscoverSite({
        siteId: id,
        ownerId,
        rootUrl: body.rootUrl,
        tags: normalizedTags,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "not found")
        return c.json({ error: "not found" }, 404);
      throw err;
    }
  }

  const updatePayload: Record<string, unknown> = {};
  if (body.enabled !== undefined) updatePayload.enabled = body.enabled;
  if (normalizedTags !== undefined)
    updatePayload.tags = normalizedTags.length ? JSON.stringify(normalizedTags) : null;
  if (body.scanPriority !== undefined) updatePayload.scanPriority = body.scanPriority;
  if (body.scanIntervalMinutes !== undefined)
    updatePayload.scanIntervalMinutes = body.scanIntervalMinutes;
  if (body.groupId !== undefined) {
    if (!body.groupId) {
      updatePayload.groupId = null;
    } else {
      const groupRows = await (db as any)
        .select()
        .from(siteGroups)
        .where(eq(siteGroups.id, body.groupId))
        .limit(1);
      const group = groupRows[0];
      if (!group || group.ownerId !== ownerId)
        return c.json({ error: "group not found" }, 404);
      updatePayload.groupId = body.groupId;
    }
  }
  if (Object.keys(updatePayload).length)
    await (db as any)
      .update(sites)
      .set({ ...updatePayload, updatedAt: new Date() })
      .where(eq(sites.id, id));

  const detail = await getSiteDetail({ siteId: id, ownerId });
  if (!detail) return c.json({ error: "not found" }, 404);
  return c.json(detail);
});

app.delete("/sites/:id", async (c) => {
  const id = c.req.param("id");
  const ownerId = c.get("userId") as string;
  const db = c.get("db") ?? (resolveDb() as any);
  const existingRows = await (db as any)
    .select()
    .from(sites)
    .where(eq(sites.id, id))
    .limit(1);
  const existing = existingRows[0];
  if (!existing || existing.ownerId !== ownerId)
    return c.json({ error: "not found" }, 404);

  await db.transaction(async (tx: any) => {
    await tx.delete(changes).where(eq(changes.siteId, id));
    await tx.delete(scans).where(eq(scans.siteId, id));
    await tx.delete(urls).where(eq(urls.siteId, id));
    await tx.delete(sitemaps).where(eq(sitemaps.siteId, id));
    await tx.delete(notificationChannels).where(eq(notificationChannels.siteId, id));
    await tx.delete(webhooks).where(eq(webhooks.siteId, id));
    await tx.delete(sites).where(eq(sites.id, id));
  });

  return c.json({ ok: true });
});

function safeParseTags(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed))
      return parsed.filter((item) => typeof item === "string" && item.trim()).map((s) => s.trim());
  } catch { }
  return [] as string[];
}

function normalizeTagsList(tags?: string[]) {
  if (!tags) return undefined;
  const normalized = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
  return normalized;
}

app.get("/sites/export.csv", async (c) => {
  const ownerId = c.get("userId");
  const db = c.get("db") ?? (resolveDb() as any);
  const rawRows = await (db as any)
    .select()
    .from(sites)
    .where(eq(sites.ownerId, ownerId))
    .orderBy(desc(sites.createdAt));

  const rows = rawRows.map((row: any) => ({
    id: row.id,
    rootUrl: row.rootUrl,
    robotsUrl: row.robotsUrl,
    createdAt: row.createdAt,
  }));
  const csv = ["id,rootUrl,robotsUrl,createdAt"]
    .concat(
      rows.map((r: any) =>
        [r.id, r.rootUrl, r.robotsUrl ?? "", r.createdAt ?? ""]
          .map((v: any) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      ),
    )
    .join("\n");
  return c.body(csv, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": "attachment; filename=sites-export.csv",
  });
});

app.get("/sites/:id", async (c) => {
  const id = c.req.param("id");
  const ownerId = c.get("userId");
  // Database will be resolved by getSiteDetail function
  const detail = await getSiteDetail({ siteId: id, ownerId });
  if (!detail) return c.json({ error: "not found" }, 404);

  return c.json(detail);
});

app.post("/sites/:id/scan", async (c) => {
  const id = c.req.param("id");
  const ownerId = c.get("userId");
  const db = c.get("db") ?? (resolveDb() as any);
  const siteRows = await (db as any)
    .select()
    .from(sites)
    .where(and(eq(sites.id, id), eq(sites.ownerId, ownerId)))
    .limit(1);
  const site = siteRows[0];
  if (!site) return c.json({ error: "not found" }, 404);
  const { scanId } = await enqueueScan(id);
  return c.json({ ok: true, status: "queued", scanId });
}); app
  .post("/sites/:id/webhooks", async (c) => {
    type WebhookBody = { targetUrl?: unknown; secret?: unknown };

    // Accept form or JSON
    let targetUrl = "";
    let secret = "";
    if (c.req.header("content-type")?.includes("application/json")) {
      const payload = (await c.req.json()) as WebhookBody;
      if (typeof payload.targetUrl === "string") targetUrl = payload.targetUrl;
      if (typeof payload.secret === "string") secret = payload.secret;
    } else {
      const form = (await c.req.parseBody()) as Record<string, unknown>;
      if (typeof form.targetUrl === "string") targetUrl = form.targetUrl;
      if (typeof form.secret === "string") secret = form.secret;
    }
    if (!targetUrl) return c.json({ error: "targetUrl required" }, 400);
    const siteId = c.req.param("id");
    const ownerId = c.get("userId");
    const db = c.get("db") ?? resolveDb() as any;
    const siteRows = await (db as any)
      .select()
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.ownerId, ownerId)))
      .limit(1);
    const site = siteRows[0];
    if (!site) return c.json({ error: "not found" }, 404);
    await (db as any)
      .insert(webhooks)
      .values({ id: randomUUID(), siteId, targetUrl, secret });
    return c.json({ ok: true });
  });

app.post("/sites/:id/test-webhook", async (c) => {
  const { notifyChange } = await import("@/lib/logic/notify");
  const siteId = c.req.param("id");
  const ownerId = c.get("userId");
  const db = c.get("db") ?? (resolveDb() as any);
  const siteRows = await (db as any)
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.ownerId, ownerId)))
    .limit(1);
  const site = siteRows[0];
  if (!site) return c.json({ error: "not found" }, 404);
  await notifyChange(siteId, {
    scanId: "test",
    added: 1,
    removed: 0,
    updated: 0,
    type: "test",
  });
  return c.json({ ok: true });
});

app.get("/sites/:id/notifications", async (c) => {
  const siteId = c.req.param("id");
  const ownerId = c.get("userId");
  const db = c.get("db") ?? (resolveDb() as any);

  const siteRows = await (db as any)
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.ownerId, ownerId)))
    .limit(1);
  const site = siteRows[0];
  if (!site) return c.json({ error: "not found" }, 404);

  const channelRows = await (db as any)
    .select()
    .from(notificationChannels)
    .where(eq(notificationChannels.siteId, siteId));

  const channels = channelRows.map((row: any) => ({
    id: row.id,
    type: row.type,
    target: row.target,
    secret: row.secret,
    createdAt: row.createdAt,
  }));

  return c.json({ channels });
});

app.post("/sites/:id/notifications", async (c) => {
  const siteId = c.req.param("id");
  const ownerId = c.get("userId");
  const db = c.get("db") ?? (resolveDb() as any);

  const siteRows = await (db as any)
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.ownerId, ownerId)))
    .limit(1);
  const site = siteRows[0];
  if (!site) return c.json({ error: "not found" }, 404);

  const body = await c.req.json();
  const schema = z.object({
    type: z.enum(["webhook", "email", "slack"]),
    target: z.string().min(3),
    secret: z.string().optional(),
  });
  const payload = schema.parse(body);

  const id = randomUUID();
  await (db as any)
    .insert(notificationChannels)
    .values({
      id,
      siteId,
      type: payload.type,
      target: payload.target.trim(),
      secret: payload.secret?.trim() || null,
    });

  return c.json({ ok: true, id });
});

app.delete("/sites/:id/notifications/:notificationId", async (c) => {
  const siteId = c.req.param("id");
  const notificationId = c.req.param("notificationId");
  const ownerId = c.get("userId");
  const db = c.get("db") ?? resolveDb() as any;

  const siteRows = await (db as any)
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.ownerId, ownerId)))
    .limit(1);
  const site = siteRows[0];
  if (!site) return c.json({ error: "not found" }, 404);

  await (db as any)
    .delete(notificationChannels)
    .where(and(eq(notificationChannels.siteId, siteId), eq(notificationChannels.id, notificationId)));

  return c.json({ ok: true });
});

app.get("/sites/:id/changes.csv", async (c) => {
  const id = c.req.param("id");
  const ownerId = c.get("userId");
  const db = c.get("db") ?? resolveDb() as any;
  const siteRows = await (db as any)
    .select()
    .from(sites)
    .where(and(eq(sites.id, id), eq(sites.ownerId, ownerId)))
    .limit(1);
  const site = siteRows[0];
  if (!site) return c.body("not found", 404);

  const url = new URL(c.req.url);
  const type = url.searchParams.get("type") || "";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";

  const filters = [eq(changes.siteId, id)];

  if (type) filters.push(eq(changes.type, type));

  const parseToUnixSeconds = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return Math.floor(date.getTime() / 1000);
  };

  const fromTs = from ? parseToUnixSeconds(from) : undefined;
  if (typeof fromTs === "number") filters.push(gte(changes.occurredAt, new Date(fromTs * 1000)));

  const toTs = to ? parseToUnixSeconds(to) : undefined;
  if (typeof toTs === "number") filters.push(lte(changes.occurredAt, new Date(toTs * 1000)));

  const [firstFilter, ...restFilters] = filters;
  let whereClause: SQL | undefined = firstFilter;
  for (const condition of restFilters) whereClause = and(whereClause!, condition);

  const rawList = await (db as any)
    .select()
    .from(changes)
    .where(whereClause)
    .orderBy(desc(changes.occurredAt));

  const list = rawList.map((row: any) => ({
    type: row.type,
    detail: row.detail,
    occurredAt: row.occurredAt,
  }));

  const rows = [["type", "detail", "occurredAt"]].concat(
    list.map((r: any) => [
      r.type,
      r.detail ?? "",
      new Date(Number(r.occurredAt || 0) * 1000).toISOString(),
    ]),
  );
  const csv = rows
    .map((r: any) =>
      r
        .map((v: any) => {
          const s = String(v).replaceAll('"', '""');
          return `"${s}"`;
        })
        .join(","),
    )
    .join("\n");

  return c.body(csv, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="changes-${id}.csv"`,
  });
});

app.get("/sites/:id/scan-diff", async (c) => {
  const siteId = c.req.param("id");
  const ownerId = c.get("userId");
  const url = new URL(c.req.url);
  const scanId = url.searchParams.get("scanId");
  if (!scanId) return c.json({ error: "scanId required" }, 400);

  const db = c.get("db") ?? resolveDb() as any;
  const scanRows = await (db as any)
    .select()
    .from(scans)
    .where(eq(scans.id, scanId));
  const scanRow = scanRows[0] ? {
    id: scanRows[0].id,
    siteId: scanRows[0].siteId,
    startedAt: scanRows[0].startedAt,
    finishedAt: scanRows[0].finishedAt,
  } : undefined;
  if (!scanRow || scanRow.siteId !== siteId) return c.json({ error: "not found" }, 404);

  const siteRows = await (db as any)
    .select()
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);
  const site = siteRows[0];
  if (!site || site.ownerId !== ownerId) return c.json({ error: "not found" }, 404);

  const rowData = await (db as any)
    .select()
    .from(changes)
    .where(and(eq(changes.siteId, siteId), eq(changes.scanId, scanId)))
    .orderBy(desc(changes.occurredAt));

  const rows = rowData.map((row: any) => ({
    type: row.type,
    detail: row.detail,
    occurredAt: row.occurredAt,
  }));

  const summary = rows.reduce(
    (acc: any, row: any) => {
      if (row.type === "added") acc.added += 1;
      else if (row.type === "removed") acc.removed += 1;
      else if (row.type === "updated") acc.updated += 1;
      return acc;
    },
    { added: 0, removed: 0, updated: 0 },
  );

  return c.json({
    scanId,
    summary,
    items: rows,
    startedAt: scanRow.startedAt,
    finishedAt: scanRow.finishedAt,
  });
});

app.post("/sites/import", async (c) => {
  const form = (await c.req.parseBody()) as Record<string, unknown>;
  let csv = "";
  const csvField = form["csv"];
  if (typeof csvField === "string" && csvField.trim()) csv = csvField.trim();
  const maybeFile = form.file;
  if (maybeFile && typeof maybeFile === "object" && "text" in maybeFile) {
    const file = maybeFile as File;
    csv = await file.text();
  }
  if (!csv) return c.json({ error: "no csv provided" }, 400);
  const lines = csv
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const ownerId = c.get("userId");
  const results: Array<{
    rootUrl: string;
    status: "success" | "skipped" | "error";
    siteId?: string;
    message?: string;
  }> = [];
  let successCount = 0;
  for (const line of lines) {
    if (!/^https?:\/\//i.test(line)) {
      results.push({
        rootUrl: line,
        status: "skipped",
        message: "URL 必须以 http 或 https 开头",
      });
      continue;
    }
    try {
      const site = await discover({ rootUrl: line, ownerId });
      successCount += 1;
      results.push({ rootUrl: line, status: "success", siteId: site.id });
    } catch (e) {
      console.error("import fail", line, e);
      results.push({
        rootUrl: line,
        status: "error",
        message: e instanceof Error ? e.message : "导入失败",
      });
    }
  }
  return c.json({ ok: true, imported: successCount, results });
});

app.post("/sites/scan-all", async (c) => {
  const ownerId = c.get("userId");
  const db = c.get("db") ?? (resolveDb() as any);

  const schema = z.object({
    scope: z.enum(["all", "filtered", "current"]).default("all"),
    filters: z.object({
      tags: z.array(z.string()).optional(),
      groupId: z.string().optional(),
    }).optional(),
  });

  const body = schema.parse(await c.req.json());
  const { scope, filters } = body;

  // 获取用户的所有站点
  let sitesQuery = db
    .select({
      id: sites.id,
      rootUrl: sites.rootUrl,
      enabled: sites.enabled,
    })
    .from(sites)
    .where(and(eq(sites.ownerId, ownerId), eq(sites.enabled, true)));

  // 根据过滤条件筛选站点
  if (scope === "filtered" && filters) {
    if (filters.tags && filters.tags.length > 0) {
      // 简单的 JSON 标签过滤
      const tagConditions = filters.tags.map(tag =>
        sql`${sites.tags}::text LIKE ${`%${tag}%`}`
      );
      sitesQuery = sitesQuery.where(and(
        eq(sites.ownerId, ownerId),
        eq(sites.enabled, true),
        or(...tagConditions)
      ));
    }
    if (filters.groupId) {
      sitesQuery = sitesQuery.where(and(
        eq(sites.ownerId, ownerId),
        eq(sites.enabled, true),
        eq(sites.groupId, filters.groupId)
      ));
    }
  }

  const allSites = await sitesQuery.orderBy(desc(sites.createdAt));

  // 如果是当前页面范围，暂时使用所有站点（前端可以传递具体站点ID列表）
  const sitesToProcess = scope === "current" ? allSites : allSites;

  let queuedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const details: Array<{
    siteId: string;
    rootUrl: string;
    status: "queued" | "skipped";
    reason?: string;
    scanId?: string;
  }> = [];

  // 批量检查现有扫描状态
  const siteIds = sitesToProcess.map(site => site.id);
  const existingScans = await db
    .select()
    .from(scans)
    .where(inArray(scans.siteId, siteIds));

  // 创建站点到现有扫描的映射
  const siteToActiveScans = new Map<string, any>();
  for (const scan of existingScans) {
    if (scan.status === "running" || scan.status === "queued") {
      siteToActiveScans.set(scan.siteId, scan);
    }
  }

  // 为每个站点尝试排队扫描
  for (const site of sitesToProcess) {
    try {
      const activeScan = siteToActiveScans.get(site.id);

      if (activeScan) {
        // 跳过已有活跃扫描的站点
        skippedCount++;
        details.push({
          siteId: site.id,
          rootUrl: site.rootUrl,
          status: "skipped",
          reason: `already_${activeScan.status}`,
          scanId: activeScan.id,
        });
      } else {
        // 使用现有的 enqueueScan 函数排队扫描
        const result = await enqueueScan(site.id);

        if (result.status === "already_running") {
          skippedCount++;
          details.push({
            siteId: site.id,
            rootUrl: site.rootUrl,
            status: "skipped",
            reason: result.status,
            scanId: result.scanId,
          });
        } else {
          queuedCount++;
          details.push({
            siteId: site.id,
            rootUrl: site.rootUrl,
            status: "queued",
            scanId: result.scanId,
          });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`${site.rootUrl}: ${errorMessage}`);
      details.push({
        siteId: site.id,
        rootUrl: site.rootUrl,
        status: "skipped",
        reason: "error",
      });
    }
  }

  return c.json({
    ok: true,
    queued: queuedCount,
    skipped: skippedCount,
    total: sitesToProcess.length,
    errors,
    details,
    scope,
    message: `成功将 ${queuedCount} 个站点加入扫描队列，跳过 ${skippedCount} 个已有活跃扫描的站点`,
  });
});

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);