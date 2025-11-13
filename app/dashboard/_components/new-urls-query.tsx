"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, Download, Calendar } from "lucide-react";
import { NewUrlsResult } from "./types";
import { sites } from "@/lib/drizzle/schema";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import NewUrlsTable from "./new-urls-table";

interface NewUrlsQueryProps {
  userId: string;
}

export default function NewUrlsQuery({ userId }: NewUrlsQueryProps) {
  const [isQuerying, setIsQuerying] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("all");
  const [sites, setSites] = useState<sites[]>([]);
  const [queryResults, setQueryResults] = useState<NewUrlsResult | null>(null);
  const [dateMode, setDateMode] = useState<"single" | "range">("single");
  const [selectedFilterSites, setSelectedFilterSites] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 获取用户站点列表
    async function fetchSites() {
      try {
        const response = await fetch("/api/sites");
        if (response.ok) {
          const data = await response.json();
          setSites(data.sites || []);
        }
      } catch (error) {
        console.error("获取站点列表失败:", error);
      }
    }
    fetchSites();
  }, [userId]);

  const handleQuery = async () => {
    if (!startDate) {
      alert("请选择开始日期");
      return;
    }

    // Clear site filters when doing a new query
    setSelectedFilterSites(new Set());

    setIsQuerying(true);
    try {
      const start = new Date(startDate);
      const end = endDate ? new Date(endDate) : new Date(startDate);

      // 验证日期范围
      if (end < start) {
        alert("结束日期不能早于开始日期");
        setIsQuerying(false);
        return;
      }

      // 构建查询参数 - request all data without pagination
      const params = new URLSearchParams({
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
      });

      if (selectedSiteId && selectedSiteId !== "all") {
        params.set("siteId", selectedSiteId);
      }

      // 调用API
      const response = await fetch(`/api/new-urls?${params.toString()}`);

      if (!response.ok) {
        throw new Error("查询失败");
      }

      const results: NewUrlsResult = await response.json();
      setQueryResults(results);
    } catch (error) {
      console.error("查询失败:", error);
      alert("查询失败，请重试");
    } finally {
      setIsQuerying(false);
    }
  };

  const handleReset = () => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    setSelectedSiteId("all");
    setQueryResults(null);
    setSelectedFilterSites(new Set());
    setDateMode("single");
  };

  const handleSiteFilterToggle = (siteId: string) => {
    setSelectedFilterSites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(siteId)) {
        newSet.delete(siteId);
      } else {
        newSet.add(siteId);
      }
      return newSet;
    });
  };

  const handleClearSiteFilters = () => {
    setSelectedFilterSites(new Set());
  };

  // 格式化日期显示
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return format(date, "yyyy年MM月dd日", { locale: zhCN });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Search className="h-5 w-5" />
          新增URL查询
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 查询表单 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 日期模式选择 */}
          <div className="space-y-2">
            <Label>查询模式</Label>
            <Select value={dateMode} onValueChange={(value: "single" | "range") => setDateMode(value)}>
              <SelectTrigger>
                <SelectValue placeholder="选择查询模式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">单日查询</SelectItem>
                <SelectItem value="range">日期范围</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 开始日期 */}
          <div className="space-y-2">
            <Label>{dateMode === "single" ? "查询日期" : "开始日期"}</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (dateMode === "single") {
                  setEndDate(e.target.value);
                }
              }}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          {/* 结束日期 */}
          {dateMode === "range" && (
            <div className="space-y-2">
              <Label>结束日期</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                max={new Date().toISOString().split('T')[0]}
                disabled={!startDate}
              />
            </div>
          )}

          {/* 站点筛选 */}
          <div className="space-y-2">
            <Label>站点筛选</Label>
            <Select value={selectedSiteId} onValueChange={setSelectedSiteId}>
              <SelectTrigger>
                <SelectValue placeholder="选择站点" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有站点</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name || site.rootUrl}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleQuery}
            disabled={isQuerying}
            className="flex items-center gap-2"
          >
            {isQuerying ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isQuerying ? "查询中..." : "查询"}
          </Button>

          <Button
            variant="outline"
            onClick={handleReset}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            重置
          </Button>

                  </div>

        {/* 查询结果统计 */}
        {queryResults && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600">
                  查询时间: {formatDateDisplay(startDate)}
                  {dateMode === "range" && endDate && ` 至 ${formatDateDisplay(endDate)}`}
                </span>
              </div>

              <Badge variant="secondary" className="flex items-center gap-1">
                <span>总计</span>
                <span className="font-semibold">{queryResults.totalCount}</span>
                <span>个新增URL</span>
              </Badge>

              {selectedSiteId !== "all" && sites.find(s => s.id === selectedSiteId) && (
                <Badge variant="outline">
                  {sites.find(s => s.id === selectedSiteId)?.name ||
                   sites.find(s => s.id === selectedSiteId)?.rootUrl}
                </Badge>
              )}
            </div>

            {/* 站点分布统计 */}
            {queryResults.siteStats.length > 1 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">站点分布:</span>
                  {selectedFilterSites.size > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSiteFilters}
                      className="text-xs h-6 px-2"
                    >
                      清除筛选 ({selectedFilterSites.size})
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {queryResults.siteStats.map((stat) => (
                    <Badge
                      key={stat.siteId}
                      variant={selectedFilterSites.has(stat.siteId) ? "default" : "outline"}
                      className={`text-xs cursor-pointer transition-all hover:scale-105 ${
                        selectedFilterSites.has(stat.siteId)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-gray-100"
                      }`}
                      onClick={() => handleSiteFilterToggle(stat.siteId)}
                    >
                      {stat.siteName || stat.siteRootUrl}: {stat.count}
                    </Badge>
                  ))}
                </div>
                {selectedFilterSites.size > 0 && (
                  <div className="text-xs text-gray-500 mt-1">
                    已选择 {selectedFilterSites.size} 个站点进行筛选
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Results Table */}
        {queryResults && (
          <div className="mt-6">
            <NewUrlsTable
              initialResults={queryResults}
              siteFilters={selectedFilterSites}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}