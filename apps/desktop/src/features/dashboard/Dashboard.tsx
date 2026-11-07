import { useCallback, useEffect, useState } from "react";
import { api, toAppError } from "../../services/api";
import { useNav } from "../../stores/nav";
import { useAuth } from "../../stores/auth";
import type { LibraryFile, Stats } from "../../types";
import { Button } from "../../components/Button";
import { BookCover } from "../../components/BookCover";
import { EmptyState } from "../../components/EmptyState";
import { KpiStrip } from "../../components/KpiStrip";
import { SectionHeader } from "../../components/SectionHeader";
import { StatusPill } from "../../components/StatusPill";

/** 总览：现在能不能导？正在跑什么？上次导了什么？（docs/04 §4.1） */
export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<LibraryFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const goto = useNav((s) => s.goto);

  const load = useCallback(async () => {
    try {
      const [st, files] = await Promise.all([api.stats(), api.listFiles()]);
      setStats(st);
      setRecent(files.slice(0, 4));
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
        <p className="text-sm text-negative-text">
          统计信息读取失败：{error}
          <button className="ml-2 underline" onClick={() => void load()}>
            重试
          </button>
        </p>
      )}

      <AccountCard />

      {stats && (
        <KpiStrip
          items={[
            { label: "已导出书籍", value: stats.books },
            { label: "导出任务", value: stats.tasks_total },
            { label: "成功任务", value: stats.tasks_completed },
          ]}
        />
      )}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12">
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
          <p className="text-sm text-muted">没有正在进行的任务。</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader
          title="最近导出"
          action={
            recent.length > 0 ? (
              <Button variant="ghost" onClick={() => goto("library")}>
                前往书库
              </Button>
            ) : undefined
          }
        />
        {recent.length === 0 ? (
          <EmptyState
            withSpines
            title="还没有导出记录"
            description="完成第一次导出后，最近的书籍会显示在这里。"
          />
        ) : (
          <ul className="flex flex-col">
            {recent.map((f) => (
              <li key={f.id} className="flex items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
                <BookCover path={f.cover_path} title={f.title || f.book_id} width={36} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm">{f.title || f.book_id}</span>
                  <span className="tnum text-xs text-faint">
                    {f.format.toUpperCase()} · {formatDate(f.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = Date.parse(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`);
  if (Number.isNaN(d)) return iso;
  return new Date(d).toLocaleDateString("zh-CN");
}

/** 登录卡：真实会话状态 + 扫码登录流程（docs/05 F1/F2） */
function AccountCard() {
  const auth = useAuth();
  const goto = useNav((s) => s.goto);

  const statusPill =
    auth.status === "in" ? (
      <StatusPill tone="positive">已登录</StatusPill>
    ) : auth.status === "checking" ? (
      <StatusPill tone="neutral">检查中…</StatusPill>
    ) : (
      <StatusPill tone="neutral">未登录</StatusPill>
    );

  const hint = auth.waiting
    ? "已在弹出浏览器中打开微信读书登录页，请使用微信扫码（300 秒内完成）。"
    : auth.status === "in"
      ? "会话有效，可以开始导入并导出书籍。"
      : auth.status === "checking"
        ? "正在检查本机登录会话…"
        : "登录后即可抓取并导出你有权阅读的书籍。";

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-6 py-5">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold">微信读书账号</h2>
          {statusPill}
        </div>
        <p className="text-sm text-muted">{hint}</p>
        {auth.lastError && <p className="text-sm text-negative-text">{auth.lastError}</p>}
      </div>
      <div className="flex items-center gap-2">
        {auth.status === "in" ? (
          <Button onClick={() => goto("export")}>导出书籍</Button>
        ) : auth.waiting ? (
          <Button onClick={() => void auth.cancelLogin()}>取消</Button>
        ) : (
          <>
            {auth.status !== "checking" && (
              <Button variant="ghost" onClick={() => void auth.check()}>
                重新检查
              </Button>
            )}
            <Button variant="primary" onClick={() => void auth.startLogin()}>
              登录微信读书
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
