-- v2: 任务章节总数。真实引擎目录事件只带 total、翻页事件只带 done，
-- 落库 total 才能算出进度百分比与「已完成 N/M 章」。NULL = 尚未获取目录。
ALTER TABLE export_tasks ADD COLUMN total_chapters INTEGER;
