import { describe, expect, test } from "bun:test";
import { deleteProject } from "../src/main/delete-project";

describe("deleteProject 步骤编排", () => {
  test("取消：只问确认，不删云端也不动本地", async () => {
    const order: string[] = [];
    const result = await deleteProject({
      confirm: () => {
        order.push("confirm");
        return Promise.resolve(false);
      },
      removeCloud: () => {
        order.push("removeCloud");
        return Promise.resolve();
      },
      trash: () => {
        order.push("trash");
        return Promise.resolve();
      },
    });
    expect(result).toEqual({ deleted: false });
    expect(order).toEqual(["confirm"]);
  });

  test("确认后先删云端再移废纸篓：本地身份文件还在，按项目名删云端", async () => {
    const order: string[] = [];
    const result = await deleteProject({
      confirm: () => Promise.resolve(true),
      removeCloud: () => {
        order.push("removeCloud");
        return Promise.resolve();
      },
      trash: () => {
        order.push("trash");
        return Promise.resolve();
      },
    });
    expect(result).toEqual({ deleted: true });
    expect(order).toEqual(["removeCloud", "trash"]);
  });

  test("云端失败：本地照常移废纸篓，结果里带回错误信息", async () => {
    const order: string[] = [];
    const result = await deleteProject({
      confirm: () => Promise.resolve(true),
      removeCloud: () => Promise.reject(new Error("网络不通")),
      trash: () => {
        order.push("trash");
        return Promise.resolve();
      },
    });
    expect(result).toEqual({ deleted: true, cloudError: "网络不通" });
    expect(order).toEqual(["trash"]);
  });

  test("没配云端：跳过云端步骤，直接移废纸篓", async () => {
    const order: string[] = [];
    const result = await deleteProject({
      confirm: () => Promise.resolve(true),
      trash: () => {
        order.push("trash");
        return Promise.resolve();
      },
    });
    expect(result).toEqual({ deleted: true });
    expect(order).toEqual(["trash"]);
  });
});
