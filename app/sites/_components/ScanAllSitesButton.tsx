"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/sonner";

interface ScanAllSitesButtonProps {
  className?: string;
  scope?: "all" | "filtered" | "current";
  filters?: {
    tags?: string[];
    groupId?: string;
  };
}

export function ScanAllSitesButton({
  className,
  scope = "all",
  filters
}: ScanAllSitesButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleScanAll = async () => {
    // 确认对话框
    const scopeText = scope === "all" ? "所有站点" : scope === "filtered" ? "当前筛选的站点" : "当前页的站点";
    const confirmed = window.confirm(
      `确定要对${scopeText}启动批量扫描吗？\n\n注意：\n• 已有扫描任务的站点将被跳过\n• 这可能会占用较多系统资源\n• 扫描完成后会自动通知结果`
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      const r = await fetch("/api/sites/scan-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ scope, filters }),
      });

      if (!r.ok) {
        const message = await parseError(r);
        toast.error(message ?? "批量扫描失败");
        return;
      }

      const payload = await r.json() as {
        ok?: boolean;
        queued?: number;
        skipped?: number;
        total?: number;
        errors?: string[];
        message?: string;
      };

      if (payload.ok) {
        // 成功消息
        const successMessage = payload.message || `成功将 ${payload.queued} 个站点加入扫描队列`;

        if (payload.queued === 0) {
          toast.info("没有站点需要扫描", {
            description: "所有选中的站点都已有扫描任务在运行中",
          });
        } else {
          toast.success(`批量扫描已启动`, {
            description: `${successMessage}${payload.skipped > 0 ? `，跳过 ${payload.skipped} 个已有扫描的站点` : ""}`,
            duration: 6000,
          });
        }

        // 显示错误信息（如果有）
        if (payload.errors && payload.errors.length > 0) {
          setTimeout(() => {
            toast.error("部分站点扫描失败", {
              description: `共 ${payload.errors.length} 个站点遇到错误：${payload.errors.slice(0, 3).join(", ")}${payload.errors.length > 3 ? "..." : ""}`,
              duration: 8000,
            });
          }, 1000);
        }
      }
    } catch (err) {
      console.error("bulk scan failed", err);
      toast.error("请求异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      className={`w-full sm:w-auto hover-lift ${className || ""}`}
      onClick={handleScanAll}
      disabled={loading}
    >
      <svg
        className="mr-2 h-4 w-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      {loading ? "处理中..." : "扫描全部"}
    </Button>
  );
}

async function parseError(res: Response) {
  try {
    const payload = (await res.json()) as unknown;
    if (payload && typeof payload === "object" && "error" in payload) {
      const { error } = payload as { error?: unknown };
      if (typeof error === "string") return error;
    }
  } catch { }
  return null;
}