import { resolveDb } from "@/lib/db";
import { sites, urls } from "@/lib/drizzle/schema";
import { and, count, desc, eq, gte, lte } from "drizzle-orm";

export interface NewUrlsQueryOptions {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  siteId?: string;
}

export interface NewUrl {
  id: string;
  url: string;
  siteId: string;
  siteRootUrl: string;
  siteName: string;
  discoveredAt: Date | null;
  changefreq?: string | null;
  priority?: string | null;
}

export interface NewUrlsResult {
  urls: NewUrl[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  siteStats: Array<{
    siteId: string;
    siteRootUrl: string;
    siteName: string;
    count: number;
  }>;
}

export async function getNewUrls(options: NewUrlsQueryOptions): Promise<NewUrlsResult> {
  const db = resolveDb();
  const {
    userId,
    startDate,
    endDate,
    siteId
  } = options;

  // 构建查询条件
  const whereConditions = [
    eq(sites.ownerId, userId),
  ];

  if (startDate) {
    whereConditions.push(gte(urls.firstSeenAt, startDate));
  }

  if (endDate) {
    // 设置结束时间为当天的23:59:59
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    whereConditions.push(lte(urls.firstSeenAt, endOfDay));
  }

  if (siteId) {
    whereConditions.push(eq(sites.id, siteId));
  }

  // 查询新增URL列表
  const urlsQuery = db
    .select({
      id: urls.id,
      url: urls.loc,
      siteId: sites.id,
      siteRootUrl: sites.rootUrl,
      siteName: sites.rootUrl, // 使用 rootUrl 作为站点名称
      discoveredAt: urls.firstSeenAt,
      changefreq: urls.changefreq,
      priority: urls.priority,
    })
    .from(urls)
    .innerJoin(sites, eq(urls.siteId, sites.id))
    .where(and(...whereConditions))
    .orderBy(desc(urls.firstSeenAt));

  // 查询总数
  const totalCountQuery = db
    .select({ count: count() })
    .from(urls)
    .innerJoin(sites, eq(urls.siteId, sites.id))
    .where(and(...whereConditions));

  // 查询按站点分布的统计
  const siteStatsQuery = db
    .select({
      siteId: sites.id,
      siteRootUrl: sites.rootUrl,
      siteName: sites.rootUrl, // 使用 rootUrl 作为站点名称
      count: count(),
    })
    .from(urls)
    .innerJoin(sites, eq(urls.siteId, sites.id))
    .where(and(...whereConditions))
    .groupBy(sites.id, sites.rootUrl) // 使用 rootUrl 而不是 name
    .orderBy(desc(count()));

  try {
    const [urlsResult, totalCountResult, siteStatsResult] = await Promise.all([
      urlsQuery,
      totalCountQuery,
      siteStatsQuery,
    ]);

    // 确保结果有效
    const urls = urlsResult || [];
    const totalCount = totalCountResult?.[0]?.count || 0;
    const siteStats = siteStatsResult || [];

    return {
      urls,
      totalCount,
      currentPage: 1,
      totalPages: Math.ceil(totalCount / 20),
      siteStats,
    };

  } catch (error) {
    console.error("Error executing queries:", error);
    throw error;
  }
}

export async function getNewUrlsForExport(options: Omit<NewUrlsQueryOptions, 'page' | 'limit'>): Promise<NewUrl[]> {
  const db = resolveDb();
  const {
    userId,
    startDate,
    endDate,
    siteId
  } = options;

  // 构建查询条件
  const whereConditions = [
    eq(sites.ownerId, userId),
  ];

  if (startDate) {
    whereConditions.push(gte(urls.firstSeenAt, startDate));
  }

  if (endDate) {
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    whereConditions.push(lte(urls.firstSeenAt, endOfDay));
  }

  if (siteId) {
    whereConditions.push(eq(sites.id, siteId));
  }

  // 查询所有结果（不分页）
  const urlsQuery = db
    .select({
      id: urls.id,
      url: urls.loc,
      siteId: sites.id,
      siteRootUrl: sites.rootUrl,
      siteName: sites.rootUrl,
      discoveredAt: urls.firstSeenAt,
      changefreq: urls.changefreq,
      priority: urls.priority,
    })
    .from(urls)
    .innerJoin(sites, eq(urls.siteId, sites.id))
    .where(and(...whereConditions))
    .orderBy(desc(urls.firstSeenAt));

  return await urlsQuery;
}