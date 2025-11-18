import Link from "next/link";
import { resolveDb } from "@/lib/db";
import { sites, siteGroups, urls } from "@/lib/drizzle/schema";
import { requireUser } from "@/lib/auth/session";
import { sql, asc, desc, and, eq } from "drizzle-orm";
import {
  SitesTableSSR,
  type SitesTableRow,
} from "@/components/data/sites-table-ssr";
import { SitesApiPanel } from "./_components/api-panel";
import { TagFilter } from "./_components/tag-filter";
import { GroupFilter } from "./_components/group-filter";
import { ScanAllSitesButton } from "./_components/ScanAllSitesButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";


export const dynamic = "force-dynamic";


function getParam(
  sp: Record<string, string | string[]> | undefined,
  key: string,
  def: string,
) {
  const v = sp?.[key];
  if (!v) return def;
  return Array.isArray(v) ? v[0] : v;
}
function getInt(
  sp: Record<string, string | string[]> | undefined,
  key: string,
  def: number,
) {
  const n = parseInt(getParam(sp, key, String(def)), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

const SORTABLE_COLUMNS = ["rootUrl", "createdAt", "urlCount"] as const;
type SortKey = (typeof SORTABLE_COLUMNS)[number];

const ORDER_COLUMNS = {
  rootUrl: sites.rootUrl,
  createdAt: sites.createdAt,
  urlCount: sql<number>`(SELECT COUNT(*) FROM ${urls} WHERE ${urls.siteId} = ${sites.id} AND ${urls.status} = 'active')`,
} as const;

export default async function SitesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const params = (searchParams ? await searchParams : {}) as
    | Record<string, string | string[]>
    | undefined;

  const redirectParams = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach((item) => redirectParams.append(key, item));
      } else if (value) {
        redirectParams.append(key, value);
      }
    }
  }
  const redirectTo = `/sites${redirectParams.toString() ? `?${redirectParams.toString()}` : ""}`;
  const user = await requireUser({ redirectTo });
  const db = resolveDb() as any;

  const tagParam = getParam(params, "tags", "");
  const selectedTags = tagParam
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const groupParam = getParam(params, "group", "");

  const page = getInt(params, "page", 1);
  const pageSize = Math.min(getInt(params, "pageSize", 10), 100);
  const sortParam = getParam(params, "sort", "createdAt");
  const sort: SortKey = SORTABLE_COLUMNS.includes(sortParam as SortKey)
    ? ((sortParam ?? "createdAt") as SortKey)
    : "createdAt";
  const dir = getParam(params, "dir", "desc") === "asc" ? "asc" : "desc";

  const orderCol = ORDER_COLUMNS[sort] ?? sites.createdAt;
  const offset = (page - 1) * pageSize;

  const tagWhere = selectedTags.length ? buildTagsWhereClause(selectedTags) : undefined;

  const ownerCondition = eq(sites.ownerId, user.id);
  let combinedWhere = tagWhere ? and(ownerCondition, tagWhere) : ownerCondition;
  if (groupParam) combinedWhere = and(combinedWhere, eq(sites.groupId, groupParam));

  const [{ count = 0 } = {}] = await db
    .select({ count: sql<number>`count(*)` })
    .from(sites)
    .where(combinedWhere);
  const total = Number(count ?? 0);

  const orderByClause = dir === "asc" ? asc(orderCol) : desc(orderCol);
  const rowsQuery = db
    .select({
      id: sites.id,
      rootUrl: sites.rootUrl,
      robotsUrl: sites.robotsUrl,
      enabled: sites.enabled,
      tags: sites.tags,
      scanPriority: sites.scanPriority,
      scanIntervalMinutes: sites.scanIntervalMinutes,
      lastScanAt: sites.lastScanAt,
      createdAt: sites.createdAt,
      groupId: sites.groupId,
      groupName: siteGroups.name,
      groupColor: siteGroups.color,
      urlCount: sql<number>`(SELECT COUNT(*) FROM ${urls} WHERE ${urls.siteId} = ${sites.id} AND ${urls.status} = 'active')`.as('urlCount'),
    })
    .from(sites)
    .leftJoin(siteGroups, eq(siteGroups.id, sites.groupId))
    .orderBy(orderByClause)
    .limit(pageSize)
    .offset(offset);
  const rows = (await rowsQuery.where(combinedWhere)) as SitesTableRow[];

  const [availableTags, availableGroups] = await Promise.all([
    fetchDistinctTags(user.id),
    fetchGroups(user.id),
  ]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">站点管理</h1>
          <p className="text-muted-foreground">管理和监控您的网站地图</p>
        </div>
        <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
          <Link href="/sites/new">
            <Button className="w-full sm:w-auto hover-lift">
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              新增站点
            </Button>
          </Link>
          <Link href="/sites/import">
            <Button variant="outline" className="w-full sm:w-auto hover-lift">
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              批量导入
            </Button>
          </Link>
          <Link href="/sites/groups">
            <Button variant="outline" className="w-full sm:w-auto hover-lift">
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h10M3 17h7" />
              </svg>
              分组管理
            </Button>
          </Link>
          <Link href="/sites/bulk">
            <Button variant="outline" className="w-full sm:w-auto hover-lift">
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              批量操作
            </Button>
          </Link>
          <a href="/api/sites/export.csv">
            <Button variant="outline" className="w-full sm:w-auto hover-lift">
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              导出 CSV
            </Button>
          </a>
          <ScanAllSitesButton />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">总站点数</CardTitle>
            <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
            <p className="text-xs text-muted-foreground">
              正在监控的站点
            </p>
          </CardContent>
        </Card>
        
        <Card className="hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">当前页面</CardTitle>
            <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
            <p className="text-xs text-muted-foreground">
              显示 {rows.length} / {total} 条记录
            </p>
          </CardContent>
        </Card>

        <Card className="hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">可用标签</CardTitle>
            <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableTags.length}</div>
            <p className="text-xs text-muted-foreground">
              不同的标签类型
            </p>
          </CardContent>
        </Card>
        <Card className="hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">站点分组</CardTitle>
            <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h10M3 17h7" />
            </svg>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{availableGroups.length}</div>
            <p className="text-xs text-muted-foreground">不同的站点分组</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <TagFilter availableTags={availableTags} />
        <GroupFilter availableGroups={availableGroups} activeGroup={groupParam} />
      </div>

      {/* Table */}
      <SitesTableSSR
        data={rows}
        sort={sort}
        dir={dir}
        page={page}
        pageSize={pageSize}
        total={total}
        searchParams={{
          sort,
          dir,
          tags: tagParam,
          group: groupParam,
        }}
      />

      {/* API Panel */}
      <SitesApiPanel />
    </div>
  );
}

async function fetchDistinctTags(ownerId: string) {
  const db = resolveDb() as any;
  const rows = await db
    .select({ tags: sites.tags })
    .from(sites)
    .where(
      and(eq(sites.ownerId, ownerId), sql`tags is not null and tags != ''`),
    );
  const tagSet = new Set<string>();
  for (const row of rows) {
    if (!row.tags) continue;
    try {
      const parsed = JSON.parse(row.tags);
      if (Array.isArray(parsed))
        parsed
          .filter((item) => typeof item === "string" && item.trim())
          .forEach((tag) => tagSet.add(tag.trim()));
    } catch {}
  }
  return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
}

function buildTagsWhereClause(tags: string[]) {
  if (tags.length === 1) return sql`${sites.tags} LIKE ${`%"${tags[0]}"%`}`;
  return and(
    ...tags.map((tag) => sql`${sites.tags} LIKE ${`%"${tag}"%`}`),
  );
}

async function fetchGroups(ownerId: string) {
  const db = resolveDb() as any;
  const rows = await db
    .select({ id: siteGroups.id, name: siteGroups.name, color: siteGroups.color })
    .from(siteGroups)
    .where(eq(siteGroups.ownerId, ownerId))
    .orderBy(asc(siteGroups.name));
  return rows;
}
