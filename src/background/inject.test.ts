import { beforeEach, describe, expect, it, vi } from "vitest";
import { injectContentScript } from "./inject.ts";

const executeScript = vi.fn();
const setBadgeText = vi.fn();
const setBadgeBackgroundColor = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("chrome", {
    scripting: { executeScript },
    action: { setBadgeText, setBadgeBackgroundColor },
  });
});

describe("injectContentScript", () => {
  it("指定タブに content script を注入し、バッジをクリアして true を返す", async () => {
    executeScript.mockResolvedValue([]);

    await expect(injectContentScript(1, "assets/content.js")).resolves.toBe(true);

    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 1 }, files: ["assets/content.js"] });
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 1, text: "" });
  });

  it("注入できないページ（chrome:// 等）ではバッジに × を出して false を返す", async () => {
    executeScript.mockRejectedValue(new Error("Cannot access a chrome:// URL"));

    await expect(injectContentScript(2, "assets/content.js")).resolves.toBe(false);

    expect(setBadgeText).toHaveBeenCalledWith({ tabId: 2, text: "×" });
    expect(setBadgeBackgroundColor).toHaveBeenCalledWith({ tabId: 2, color: "#dc2626" });
  });
});
