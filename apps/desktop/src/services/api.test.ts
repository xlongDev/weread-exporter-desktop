import { describe, expect, it } from "vitest";
import { toAppError } from "./api";

describe("toAppError（统一错误归一）", () => {
  it("字符串错误", () => {
    const e = toAppError("数据库锁获取失败");
    expect(e.code).toBe("IPC_ERROR");
    expect(e.category).toBe("SYSTEM");
    expect(e.userMessage).toBe("数据库锁获取失败");
    expect(e.recoverable).toBe(true);
    expect(e.timestamp).toBeTruthy();
  });

  it("Error 对象", () => {
    const e = toAppError(new Error("invoke failed"));
    expect(e.userMessage).toBe("invoke failed");
  });

  it("未知类型兜底", () => {
    const e = toAppError(42);
    expect(e.userMessage).toBe("42");
    expect(e.message).toBe("42");
  });
});
