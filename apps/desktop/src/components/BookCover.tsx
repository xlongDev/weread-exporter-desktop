import { useState } from "react";
import { t } from "../i18n";
import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * 封面：本地文件走 asset 协议；缺失/加载失败时显示衬线书脊占位。
 * fill 模式（书库封面墙）：宽度撑满容器、固定 3:4；fallback 升级为竖排双字书脊。
 */
export function BookCover({
  path,
  title,
  width = 88,
  fill = false,
}: {
  path?: string;
  title: string;
  width?: number;
  fill?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const height = Math.round(width * (4 / 3));

  if (path && !failed) {
    return (
      <img
        src={convertFileSrc(path)}
        width={fill ? undefined : width}
        height={fill ? undefined : height}
        alt={t("《{title}》封面", { title })}
        loading="lazy"
        onError={() => setFailed(true)}
        className={
          fill
            ? "aspect-[3/4] w-full flex-none rounded-[10px] border border-line object-cover"
            : "flex-none rounded-[10px] border border-line object-cover"
        }
      />
    );
  }
  return (
    <div
      style={fill ? { aspectRatio: "3 / 4" } : { width, height }}
      className={
        fill
          ? "flex w-full flex-none items-center justify-center rounded-[10px] border border-line bg-raised"
          : "flex flex-none items-center justify-center rounded-[10px] border border-line bg-raised"
      }
      aria-hidden="true"
    >
      {fill ? (
        <span className="font-serif text-3xl text-muted [writing-mode:vertical-rl]">
          {title.slice(0, 2) || t("书")}
        </span>
      ) : (
        <span className="font-serif text-xl text-muted">{title.slice(0, 1) || t("书")}</span>
      )}
    </div>
  );
}
