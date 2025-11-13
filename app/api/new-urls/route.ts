import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getNewUrls } from "@/lib/queries/new-urls";

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

    const results = await getNewUrls(options);

    // 确保results和urls存在
    if (!results || !results.urls) {
      return NextResponse.json({
        urls: [],
        totalCount: 0,
        currentPage: 1,
        totalPages: 0,
        siteStats: [],
      });
    }

    // 序列化日期为ISO字符串
    const serializedResults = {
      ...results,
      urls: results.urls.map(url => ({
        ...url,
        discoveredAt: url.discoveredAt ? url.discoveredAt.toISOString() : new Date().toISOString(),
      })),
    };

    return NextResponse.json(serializedResults);

  } catch (error) {
    console.error("查询新增URL失败:", error);
    return NextResponse.json(
      {
        error: "查询失败，请重试",
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}