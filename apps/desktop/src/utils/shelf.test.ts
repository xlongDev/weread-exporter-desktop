import { describe, expect, it } from "vitest";
import { filterShelfItems } from "./shelf";
import type { ShelfItem } from "../types";

const items: ShelfItem[] = [
  { book_id: "1", title: "大侦探波洛探案全集", author: "阿加莎·克里斯蒂", cover: "" },
  { book_id: "2", title: "三体", author: "刘慈欣", cover: "" },
  { book_id: "3", title: "没有个性的人", author: "", cover: "" },
];

describe("filterShelfItems（书架导入弹窗搜索）", () => {
  it("空查询原序返回", () => {
    expect(filterShelfItems(items, "  ")).toBe(items);
  });

  it("按书名匹配（大小写不敏感）", () => {
    expect(filterShelfItems(items, "三体").map((b) => b.book_id)).toEqual(["2"]);
  });

  it("按作者匹配", () => {
    expect(filterShelfItems(items, "阿加莎").map((b) => b.book_id)).toEqual(["1"]);
  });

  it("无匹配返回空数组", () => {
    expect(filterShelfItems(items, "不存在")).toEqual([]);
  });
});
