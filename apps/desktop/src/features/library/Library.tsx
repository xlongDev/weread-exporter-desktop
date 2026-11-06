import { EmptyState } from "../../components/EmptyState";

/** 书库：导出过哪些书？（封面墙 Phase 6 接入，当前空态为真实状态） */
export function Library() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-ink">书库</h1>
      <EmptyState
        withSpines
        title="书库为空"
        description="导出的电子书（PDF / EPUB / Markdown）会保存在这里，可搜索、打开与整理。"
      />
    </div>
  );
}
