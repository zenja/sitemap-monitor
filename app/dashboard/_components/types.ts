export interface NewUrl {
  id: string;
  url: string;
  siteId: string;
  siteRootUrl: string;
  siteName: string; // 使用 rootUrl 作为站点名称
  discoveredAt: Date | string; // API返回字符串，客户端转换为Date
  changefreq?: string | null;
  priority?: string | null;
}

export interface SiteStats {
  siteId: string;
  siteRootUrl: string;
  siteName: string; // 使用 rootUrl 作为站点名称
  count: number;
}

export interface NewUrlsResult {
  urls: NewUrl[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  siteStats: SiteStats[];
}