import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getNewUrlsForExport } from "@/lib/queries/new-urls";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    // 获取查询参数
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const siteId = searchParams.get("siteId");

    // 构建查询选项
    const options = {
      userId: user.id,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      siteId: siteId && siteId !== "all" ? siteId : undefined,
    };

    // 获取导出数据
    const urls = await getNewUrlsForExport(options);

    if (urls.length === 0) {
      return NextResponse.json({ error: "没有可导出的数据" }, { status: 404 });
    }

    // 生成CSV内容
    const csvHeaders = [
      "URL地址",
      "所属站点名称",
      "站点根域名",
      "发现时间",
      "变更频率",
      "优先级"
    ];

    const csvRows = urls.map((url, index) => [
      url.url,
      url.siteName || "",
      url.siteRootUrl,
      format(new Date(url.discoveredAt), "yyyy-MM-dd HH:mm:ss", { locale: zhCN }),
      url.changefreq || "",
      url.priority || ""
    ]);

    // 构建CSV字符串
    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map(row =>
        row.map(cell => {
          // 处理包含逗号、引号或换行符的字段
          if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
            return `"${cell.replace(/"/g, '""')}"`;
          }
          return cell;
        }).join(",")
      )
    ].join("\n");

    // 添加BOM以支持中文
    const bom = "\uFEFF";
    const csvWithBom = bom + csvContent;

    // 生成文件名
    const now = new Date();
    const dateRange = startDate && endDate
      ? `${format(new Date(startDate), "yyyyMMdd")}-${format(new Date(endDate), "yyyyMMdd")}`
      : startDate
        ? format(new Date(startDate), "yyyyMMdd")
        : format(now, "yyyyMMdd");

    const filename = `新增URL_${dateRange}_${format(now, "yyyyMMdd_HHmmss")}.csv`;

    // 设置响应头
    const headers = new Headers();
    headers.set("Content-Type", "text/csv; charset=utf-8");
    headers.set("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");

    return new NextResponse(csvWithBom, {
      status: 200,
      headers,
    });

  } catch (error) {
    console.error("导出新增URL失败:", error);
    return NextResponse.json(
      {
        error: "导出失败，请重试",
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // 支持POST请求以处理大量数据的导出
  return GET(request);
}