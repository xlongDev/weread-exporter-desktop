import type { LibraryFile, ShelfItem } from "../types";

const FORMAT_ORDER: Record<string, number> = { pdf: 0, epub: 1, markdown: 2 };

/** 书架条目：按书聚合导出文件（书库书架视图与首页「最近导出」共用） */
export interface ShelfBook {
  bookId: string;
  title: string;
  author: string;
  coverPath?: string;
  files: LibraryFile[];
}

/** 按 book_id 聚合；组间保持传入序（listFiles 为最近优先），组内按格式固定序 */
export function groupFiles(files: LibraryFile[]): ShelfBook[] {
  const map = new Map<string, LibraryFile[]>();
  for (const f of files) {
    const list = map.get(f.book_id);
    if (list) list.push(f);
    else map.set(f.book_id, [f]);
  }
  return [...map.entries()].map(([bookId, list]) => ({
    bookId,
    title: list.find((f) => f.title)?.title || bookId,
    author: list.find((f) => f.author)?.author || "",
    coverPath: list.find((f) => f.cover_path)?.cover_path,
    files: [...list].sort((a, b) => (FORMAT_ORDER[a.format] ?? 9) - (FORMAT_ORDER[b.format] ?? 9)),
  }));
}

/** 微信读书书架卡片按标题/作者过滤（书架一键导入弹窗用）；空查询原序返回 */
export function filterShelfItems(items: ShelfItem[], query: string): ShelfItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
}
