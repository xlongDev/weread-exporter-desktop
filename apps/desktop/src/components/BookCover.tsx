import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

/** 封面：本地文件走 asset 协议；缺失/加载失败时显示衬线首字书脊占位 */
export function BookCover({ path, title, width = 88 }: { path?: string; title: string; width?: number }) {
  const [failed, setFailed] = useState(false);
  const height = Math.round(width * (4 / 3));

  if (path && !failed) {
    return (
      <img
        src={convertFileSrc(path)}
        width={width}
        height={height}
        alt={`《${title}》封面`}
        loading="lazy"
        onError={() => setFailed(true)}
        className="flex-none rounded-[3px] border border-line object-cover"
      />
    );
  }
  return (
    <div
      style={{ width, height }}
      className="flex flex-none items-center justify-center rounded-[3px] border border-line bg-raised"
      aria-hidden="true"
    >
      <span className="font-serif text-xl text-muted">{title.slice(0, 1) || "书"}</span>
    </div>
  );
}
