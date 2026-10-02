import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncActionPopup, UNLOCK_POPUP } from "./action-popup.ts";

const setPopup = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("chrome", { action: { setPopup } });
});

describe("syncActionPopup", () => {
  it("ロック中はアイコンのクリックで解除ポップアップを開く", async () => {
    await syncActionPopup(async () => "locked");
    expect(setPopup).toHaveBeenCalledWith({ popup: UNLOCK_POPUP });
  });

  it.each(["plain", "unlocked"] as const)("%s ならポップアップなし（クリックでそのまま入力）", async (state) => {
    await syncActionPopup(async () => state);
    expect(setPopup).toHaveBeenCalledWith({ popup: "" });
  });
});
