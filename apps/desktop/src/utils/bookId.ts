/** 与引擎 extract_book_id 相同规则的前端实现（docs/08 §4 对齐测试覆盖） */
export function extractBookId(raw: string): string {
  const text = (raw ?? "").trim();
  const m = text.match(/(?:reader|bookDetail)\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{6,36}$/.test(text)) return text;
  const cleaned = text
    .replace(/^https?:\/\/[^/]+\//, "")
    .split("?")[0]
    .replace(/^\/+|\/+$/g, "");
  return cleaned || text;
}

export function looksLikeBookId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{6,36}$/.test(id);
}

/** 从多行/多分隔符输入中提取全部书籍 ID，去重保序（批量导出用） */
export function extractBookIds(text: string): string[] {
  return [
    ...new Set(
      (text ?? "")
        .split(/[\s,，;；、]+/)
        .map((s) => extractBookId(s))
        .filter(looksLikeBookId),
    ),
  ];
}
