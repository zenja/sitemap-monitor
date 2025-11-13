import { resolveDb } from "@/lib/db";
import { sites, changes, scans } from "@/lib/drizzle/schema";
import { gte, eq, and, sql } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import DashboardClient from "./_components/dashboard-client";




export default async function Page() {
  const user = await requireUser({ redirectTo: "/dashboard" });
  const db = resolveDb() as any;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // 使用并行查询和聚合优化性能
  const [siteRows, changeStats] = await Promise.all([
    db.select().from(sites).where(eq(sites.ownerId, user.id)),
    db
      .select({
        type: changes.type,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(changes)
      .innerJoin(sites, eq(changes.siteId, sites.id))
      .where(and(eq(sites.ownerId, user.id), gte(changes.occurredAt, since)))
      .groupBy(changes.type),
  ]);

  const added = changeStats.find((s: any) => s.type === 'added')?.count || 0;
  const removed = changeStats.find((s: any) => s.type === 'removed')?.count || 0;

  // 使用聚合查询优化扫描统计
  const scanStats = await db
    .select({
      total: sql<number>`COUNT(*)::int`,
      failed: sql<number>`COUNT(CASE WHEN ${scans.status} != 'success' THEN 1 END)::int`,
      avgDuration: sql<number>`AVG(EXTRACT(EPOCH FROM (${scans.finishedAt} - ${scans.startedAt})))`,
    })
    .from(scans)
    .innerJoin(sites, eq(scans.siteId, sites.id))
    .where(and(
      eq(sites.ownerId, user.id),
      gte(scans.startedAt, since),
      sql`${scans.finishedAt} IS NOT NULL`
    ));

  const total = scanStats[0]?.total || 0;
  const failed = scanStats[0]?.failed || 0;
  const duration = scanStats[0]?.avgDuration || 0;

  // 使用 SQL 聚合查询优化活跃站点排行
  const topSites = await db
    .select({
      siteId: sites.id,
      rootUrl: sites.rootUrl,
      scanCount: sql<number>`COUNT(${scans.id})::int`,
    })
    .from(sites)
    .leftJoin(
      scans,
      and(eq(scans.siteId, sites.id), gte(scans.startedAt, since)),
    )
    .where(eq(sites.ownerId, user.id))
    .groupBy(sites.id, sites.rootUrl)
    .orderBy(sql`COUNT(${scans.id}) DESC`)
    .limit(5);

  const trendWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // 使用 SQL 聚合查询优化性能，而不是在应用层处理大量数据
  const trendChangeRows = await db
    .select({
      day: sql<string>`DATE(${changes.occurredAt})`,
      type: changes.type,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(changes)
    .innerJoin(sites, eq(changes.siteId, sites.id))
    .where(and(eq(sites.ownerId, user.id), gte(changes.occurredAt, trendWindowStart)))
    .groupBy(sql`DATE(${changes.occurredAt})`, changes.type)
    .orderBy(sql`DATE(${changes.occurredAt})`);

  // Group changes by day and count by type
  const trendMap = new Map<string, { added: number; removed: number; updated: number }>();

  for (const row of trendChangeRows) {
    const day = row.day;
    if (!day) continue;

    if (!trendMap.has(day)) {
      trendMap.set(day, { added: 0, removed: 0, updated: 0 });
    }

    const dayData = trendMap.get(day)!;
    const count = Number(row.count || 0);
    if (row.type === 'added') dayData.added += count;
    else if (row.type === 'removed') dayData.removed += count;
    else if (row.type === 'updated') dayData.updated += count;
  }

  const changeTrendRows = Array.from(trendMap.entries())
    .map(([day, counts]) => ({ day, ...counts }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const sitesCount = siteRows.length;
  const added24h = Number(added ?? 0);
  const removed24h = Number(removed ?? 0);
  const totalScans = Number(total ?? 0);
  const failedScans = Number(failed ?? 0);
  const avgDuration = duration
    ? Math.round((Number(duration) / 60) * 10) / 10
    : 0;
  const failRate = totalScans
    ? Math.round((failedScans / totalScans) * 100)
    : 0;

  const changeTrend = changeTrendRows.map((row) => ({
    date: row.day,
    added: Number(row.added ?? 0),
    removed: Number(row.removed ?? 0),
    updated: Number(row.updated ?? 0),
  }));

  return (
    <DashboardClient
      userId={user.id}
      sitesCount={sitesCount}
      added24h={added24h}
      removed24h={removed24h}
      failRate={failRate}
      avgDuration={avgDuration}
      changeTrend={changeTrend}
      topSites={topSites}
    />
  );
}


