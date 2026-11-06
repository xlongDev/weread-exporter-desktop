import { useCallback, useEffect, useState } from "react";
import { api, toAppError } from "../../services/api";
import { useNav } from "../../stores/nav";
import type { Stats } from "../../types";
import { Button } from "../../components/Button";
import { EmptyState } from "../../components/EmptyState";
import { KpiStrip } from "../../components/KpiStrip";
import { SectionHeader } from "../../components/SectionHeader";
import { StatusPill } from "../../components/StatusPill";

/** 总览：现在能不能导？正在跑什么？上次导了什么？（docs/04 §4.1） */
export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const goto = useNav((s) => s.goto);

  const load = useCallback(async () => {
    try {
      setStats(await api.stats());
      setError(null);
    } catch (e) {
      setError(toAppError(e).userMessage);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-ink">总览</h1>

      {error && (
        <p className="text-sm text-negative">
          统计信息读取失败：{error}
          <button className="ml-2 underline" onClick={() => void load()}>
            重试
          </button>
        </p>
      )}

      <section className="flex items-center justify-between rounded-card border border-line bg-surface px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold">微信读书账号</h2>
            <StatusPill tone="neutral">未登录</StatusPill>
          </div>
          <p className="text-sm text-muted">
            登录后即可抓取并导出你有权阅读的书籍。
          </p>
        </div>
      </section>

      {stats && (
        <KpiStrip
          items={[
            { label: "已导出书籍", value: stats.books },
            { label: "导出任务", value: stats.tasks_total },
            { label: "成功任务", value: stats.tasks_completed },
          ]}
        />
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="正在进行的任务"
          action={
            stats && stats.tasks_running > 0 ? (
              <Button variant="ghost" onClick={() => goto("tasks")}>
                前往任务中心
              </Button>
            ) : undefined
          }
        />
        {stats && stats.tasks_running > 0 ? (
          <p className="tnum text-sm text-muted">{stats.tasks_running} 个任务进行中</p>
        ) : (
          <p className="text-sm text-faint">没有正在进行的任务。</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="最近导出" />
        <EmptyState
          withSpines
          title="还没有导出记录"
          description="完成第一次导出后，最近的书籍会显示在这里。"
        />
      </section>
    </div>
  );
}
