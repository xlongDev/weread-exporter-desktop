import { describe, expect, it } from "vitest";
import { extractBookId, extractBookIds, looksLikeBookId } from "./bookId";

// 与 engine/tests/test_engine_functions.py 的用例保持对齐（docs/11 §3）
describe("extractBookId（与引擎 extract_book_id 规则对齐）", () => {
  it("完整阅读页链接", () => {
    expect(extractBookId("https://weread.qq.com/web/reader/3b132980813ab94eeg013129")).toBe(
      "3b132980813ab94eeg013129",
    );
  });

  it("书籍详情页链接", () => {
    expect(extractBookId("https://weread.qq.com/web/bookDetail/abc123def456")).toBe("abc123def456");
  });

  it("纯 ID", () => {
    expect(extractBookId("3b132980813ab94eeg013129")).toBe("3b132980813ab94eeg013129");
  });

  it("带查询参数的链接", () => {
    expect(extractBookId("https://weread.qq.com/web/reader/abc123?source=share")).toBe("abc123");
  });

  it("过短字符串回退为原文", () => {
    expect(extractBookId("ab")).toBe("ab");
  });

  it("空字符串", () => {
    expect(extractBookId("")).toBe("");
  });
});

describe("looksLikeBookId（与 Rust 端 valid_book_id 对齐）", () => {
  it("合法 ID 边界（6~36 位）", () => {
    expect(looksLikeBookId("abc123")).toBe(true);
    expect(looksLikeBookId("a".repeat(36))).toBe(true);
    expect(looksLikeBookId("abc12")).toBe(false);
    expect(looksLikeBookId("a".repeat(37))).toBe(false);
  });

  it("非法字符", () => {
    expect(looksLikeBookId("abc 123")).toBe(false);
    expect(looksLikeBookId("中文ID测试")).toBe(false);
    expect(looksLikeBookId("abc/123")).toBe(false);
  });
});

describe("extractBookIds（批量多本提取）", () => {
  it("多行多链接去重保序", () => {
    const text = "https://weread.qq.com/web/reader/aaa111\nbbb222\nhttps://weread.qq.com/web/reader/aaa111";
    expect(extractBookIds(text)).toEqual(["aaa111", "bbb222"]);
  });

  it("逗号/中文分号/顿号分隔", () => {
    expect(extractBookIds("ccc333，ddd444;eee555、fff666")).toEqual(["ccc333", "ddd444", "eee555", "fff666"]);
  });

  it("无有效 ID 返回空数组", () => {
    expect(extractBookIds("随便一段文字\n没有链接")).toEqual([]);
    expect(extractBookIds("")).toEqual([]);
  });

  it("单链接结果与 extractBookId 一致", () => {
    const url = "https://weread.qq.com/web/reader/abc12345";
    expect(extractBookIds(url)).toEqual([extractBookId(url)]);
  });
});
