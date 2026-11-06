import { EmptyState } from "../../components/EmptyState";

/** 任务中心：导出进行到哪了？（任务列表 Phase 6 接入，当前空态为真实状态） */
export function Tasks() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-ink">任务中心</h1>
      <EmptyState
        withSpines
        title="暂无任务"
        description="创建导出任务后会出现在这里，可实时查看章节进度、耗时与结果。"
      />
    </div>
  );
}
