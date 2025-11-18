import Link from "next/link";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { EmptyState } from "@/components/ui/empty-state";
import { SimplePagination } from "@/components/ui/simple-pagination";
import { PageSizeSelectorClient } from "@/components/ui/page-size-selector-client";
import { PageJumper } from "@/components/ui/pagination";
import { formatDate, formatDateTime, formatTime } from "@/lib/datetime";

export type SitesTableRow = {
  id: string;
  rootUrl: string;
  robotsUrl: string | null;
  createdAt: number | null;
  enabled: boolean | null;
  tags?: string | null;
  scanPriority?: number | null;
  scanIntervalMinutes?: number | null;
  lastScanAt?: Date | number | null;
  groupId?: string | null;
  groupName?: string | null;
  groupColor?: string | null;
  urlCount?: number | null;
};

export function SitesTableSSR({
  data,
  sort,
  dir,
  page,
  pageSize,
  total,
  searchParams = {},
}: {
  data: SitesTableRow[];
  sort: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  total: number;
  searchParams?: Record<string, string>;
}) {
  const nextDir = (col: string) =>
    sort === col && dir === "asc" ? "desc" : "asc";
  const sortIcon = (col: string) =>
    sort === col ? (dir === "asc" ? "↑" : "↓") : "";

  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                  <a
                    className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
                    href={`/sites?page=1&pageSize=${pageSize}&sort=rootUrl&dir=${nextDir("rootUrl")}`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                    </svg>
                    站点地址 {sortIcon("rootUrl")}
                  </a>
                </th>
                <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    robots.txt
                  </div>
                </th>
                <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                  <a
                    className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
                    href={`/sites?page=1&pageSize=${pageSize}&sort=createdAt&dir=${nextDir("createdAt")}`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    创建时间 {sortIcon("createdAt")}
                  </a>
                </th>
                <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    扫描策略
                  </div>
                </th>
                <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    状态
                  </div>
                </th>
                <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h10M3 17h7" />
                    </svg>
                    分组
                  </div>
                </th>
                <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                  <a
                    className="inline-flex items-center gap-2 hover:text-foreground transition-colors"
                    href={`/sites?page=1&pageSize=${pageSize}&sort=urlCount&dir=${nextDir("urlCount")}`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                    </svg>
                    URL数量 {sortIcon("urlCount")}
                  </a>
                </th>
                <th className="h-12 px-4 text-left font-medium text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    标签
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((r, index) => (
                <tr
                  key={r.id}
                  className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <Link 
                          className="font-medium text-primary hover:underline underline-offset-4" 
                          href={`/sites/${r.id}`}
                        >
                          {r.rootUrl}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-1">ID: {r.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    {r.robotsUrl ? (
                      <a 
                        href={r.robotsUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-success hover:underline"
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        查看
                      </a>
                    ) : (
                      <span className="text-muted-foreground">未找到</span>
                    )}
                  </td>
                  <td className="p-4">
                    {formatDate(r.createdAt) === "—" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div>
                        <div className="font-medium">{formatDate(r.createdAt)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(r.createdAt, { includeSeconds: true })}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div>
                        优先级：P{r.scanPriority ?? 1}
                      </div>
                      <div>
                        间隔：{r.scanIntervalMinutes ?? 1440} 分钟
                      </div>
                      <div>
                        上次：
                        {r.lastScanAt ? formatDateTime(r.lastScanAt, { includeSeconds: false }) : "—"}
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <StatusIndicator status={r.enabled ? "success" : "pending"}>
                      {r.enabled ? "启用中" : "已禁用"}
                    </StatusIndicator>
                  </td>
                  <td className="p-4">
                    {r.groupName ? (
                      <span
                        className="inline-flex items-center rounded-md border px-2 py-1 text-xs"
                        style={r.groupColor ? { borderColor: r.groupColor, color: r.groupColor } : undefined}
                      >
                        {r.groupName}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">未分组</span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {r.urlCount ?? 0}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        个URL
                      </span>
                    </div>
                  </td>
                  <td className="p-4">
                    {parseTags(r.tags).length ? (
                      <div className="flex flex-wrap gap-1">
                        {parseTags(r.tags).slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                          >
                            {tag}
                          </span>
                        ))}
                        {parseTags(r.tags).length > 3 && (
                          <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                            +{parseTags(r.tags).length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">无标签</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td className="p-0" colSpan={8}>
                    <EmptyState
                      title="暂无站点数据"
                      description="开始添加您的第一个站点进行监控"
                      action={{
                        label: "添加站点",
                        href: "/sites/new"
                      }}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分页控件 */}
      <div className="space-y-4">
        {/* 页面大小选择器和快速跳转 */}
        <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
          <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
            <PageSizeSelectorClient
              currentPageSize={pageSize}
              baseUrl="/sites"
              searchParams={searchParams}
              options={[5, 10, 20, 50, 100]}
            />
            <PageJumper
              currentPage={page}
              totalPages={lastPage}
              baseUrl="/sites"
              searchParams={searchParams}
            />
          </div>
        </div>

        {/* 主分页组件 */}
        <SimplePagination
          currentPage={page}
          totalPages={lastPage}
          pageSize={pageSize}
          total={total}
          baseUrl="/sites"
          searchParams={searchParams}
        />
      </div>
    </div>
  );
}

function parseTags(value: string | null | undefined) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed))
      return parsed.filter((item) => typeof item === "string" && item.trim()).map((s) => s.trim());
  } catch {}
  return [] as string[];
}
