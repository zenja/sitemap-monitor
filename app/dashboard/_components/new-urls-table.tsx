"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExternalLink, Globe, ChevronLeft, ChevronRight } from "lucide-react";
import { NewUrlsResult } from "./types";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

interface NewUrlsTableProps {
  initialResults?: NewUrlsResult;
  siteFilters?: Set<string>;
  urlFilter?: string;
}

export default function NewUrlsTable({
  initialResults,
  siteFilters = new Set(),
  urlFilter = ""
}: NewUrlsTableProps) {
  const [results, setResults] = useState<NewUrlsResult | null>(initialResults || null);
  const [currentPage, setCurrentPage] = useState(1);

  // Update results when initialResults change
  useEffect(() => {
    setResults(initialResults || null);
    setCurrentPage(1);
  }, [initialResults]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [siteFilters, urlFilter]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // 滚动到表格顶部
    const tableElement = document.getElementById('urls-table');
    if (tableElement) {
      tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleUrlClick = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const formatDate = (date: Date | string) => {
    return format(new Date(date), "yyyy-MM-dd HH:mm", { locale: zhCN });
  };

  const truncateUrl = (url: string, maxLength: number = 60) => {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + "...";
  };

  // Filter URLs based on selected site filters and URL filter
  const getFilteredUrls = () => {
    if (!results) return [];

    let filteredUrls = results.urls;

    // Apply site filters if any
    if (siteFilters.size > 0) {
      filteredUrls = filteredUrls.filter(url => siteFilters.has(url.siteId));
    }

    // Apply URL filter if any
    if (urlFilter.trim()) {
      const searchTerm = urlFilter.toLowerCase().trim();
      filteredUrls = filteredUrls.filter(url =>
        url.url.toLowerCase().includes(searchTerm)
      );
    }

    return filteredUrls;
  };

  const getFilteredResults = () => {
    if (!results) return null;

    const allUrls = getFilteredUrls();
    const pageSize = 20;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedUrls = allUrls.slice(startIndex, endIndex);
    const hasFilters = siteFilters.size > 0 || urlFilter.trim();

    return {
      urls: paginatedUrls,
      totalCount: hasFilters ? allUrls.length : results.totalCount,
      currentPage: currentPage,
      totalPages: Math.ceil(hasFilters ? allUrls.length / pageSize : results.totalPages)
    };
  };


  const renderPagination = () => {
    const filteredResults = getFilteredResults();
    if (!filteredResults || filteredResults.totalPages <= 1) return null;

    const totalPages = filteredResults.totalPages;
    const maxVisiblePages = 5;

    // 计算显示的页码范围
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    // 添加页码按钮
    const pageButtons = [];

    // 首页
    if (startPage > 1) {
      pageButtons.push(
        <Button
          key={1}
          variant={currentPage === 1 ? "default" : "outline"}
          size="sm"
          onClick={() => handlePageChange(1)}
          className="min-w-[40px]"
        >
          1
        </Button>
      );
      if (startPage > 2) {
        pageButtons.push(<span key="start-ellipsis" className="px-2">...</span>);
      }
    }

    // 中间页码
    for (let i = startPage; i <= endPage; i++) {
      pageButtons.push(
        <Button
          key={i}
          variant={i === currentPage ? "default" : "outline"}
          size="sm"
          onClick={() => handlePageChange(i)}
          className="min-w-[40px]"
        >
          {i}
        </Button>
      );
    }

    // 末页
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        pageButtons.push(<span key="end-ellipsis" className="px-2">...</span>);
      }
      pageButtons.push(
        <Button
          key={totalPages}
          variant={currentPage === totalPages ? "default" : "outline"}
          size="sm"
          onClick={() => handlePageChange(totalPages)}
          className="min-w-[40px]"
        >
          {totalPages}
        </Button>
      );
    }

    return (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
        <div className="text-sm text-gray-600 text-center sm:text-left">
          {(siteFilters.size > 0 || urlFilter.trim()) && (
            <span className="text-blue-600 font-medium">筛选结果: </span>
          )}
          显示第 {((currentPage - 1) * 20) + 1} - {Math.min(currentPage * 20, filteredResults.totalCount)} 条，
          共 {filteredResults.totalCount} 条记录
          {(siteFilters.size > 0 || urlFilter.trim()) && (
            <span className="text-blue-600 font-medium ml-2">
              (从 {results?.totalCount || 0} 条中筛选)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pageButtons}
          <Button
            variant="outline"
            size="sm"
            onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const filteredResults = getFilteredResults();

  if (!filteredResults || filteredResults.urls.length === 0) {
    const hasFilters = siteFilters.size > 0 || urlFilter.trim();
    return (
      <div className="py-12 text-center border-t">
        <div className="text-gray-500">
          <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-2">
            {hasFilters ? "筛选后无数据" : "暂无新增URL数据"}
          </h3>
          <p className="text-sm">
            {hasFilters
              ? "当前筛选条件下没有找到URL，请尝试调整筛选条件。"
              : "请选择日期范围进行查询，或该时间段内没有新的URL被发现。"
            }
          </p>
        </div>
      </div>
    );
  }

  return (
    <div id="urls-table" className="border-t p-6">
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">#</TableHead>
                <TableHead className="min-w-[200px] max-w-xs">URL地址</TableHead>
                <TableHead className="min-w-[150px]">所属站点</TableHead>
                <TableHead className="min-w-[120px]">发现时间</TableHead>
                <TableHead className="w-[80px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredResults.urls.map((url, index) => (
                <TableRow key={url.id} className="hover:bg-gray-50">
                  <TableCell className="text-sm text-gray-500">
                    {(currentPage - 1) * 20 + index + 1}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <div className="flex items-center gap-2">
                      <ExternalLink className="h-3 w-3 text-gray-400 flex-shrink-0" />
                      <span
                        className="text-blue-600 hover:text-blue-800 cursor-pointer truncate"
                        onClick={() => handleUrlClick(url.url)}
                        title={url.url}
                      >
                        {truncateUrl(url.url)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm truncate" title={url.siteRootUrl}>
                      {url.siteRootUrl}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(url.discoveredAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUrlClick(url.url)}
                      className="h-8 w-8 p-0"
                      title="访问链接"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* 分页控件 */}
        {renderPagination()}
    </div>
  );
}