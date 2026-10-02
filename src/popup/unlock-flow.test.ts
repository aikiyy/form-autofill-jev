import { describe, expect, it, vi } from "vitest";
import { WrongPassphraseError } from "../storage/crypto.ts";
import { unlockAndFill, type UnlockDeps } from "./unlock-flow.ts";

function deps(overrides: Partial<UnlockDeps> = {}): UnlockDeps {
  return {
    unlock: vi.fn().mockResolvedValue(undefined),
    activeTabId: vi.fn().mockResolvedValue(7),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("unlockAndFill", () => {
  it("解除できたら、今のタブで入力を続けるよう background に頼む", async () => {
    const d = deps();
    await expect(unlockAndFill("correct horse", d)).resolves.toEqual({ ok: true });
    expect(d.unlock).toHaveBeenCalledWith("correct horse");
    expect(d.sendMessage).toHaveBeenCalledWith({ type: "fillAfterUnlock", tabId: 7 });
  });

  it("パスフレーズが違えば入力せずにエラーを返す", async () => {
    const d = deps({ unlock: vi.fn().mockRejectedValue(new WrongPassphraseError()) });
    await expect(unlockAndFill("wrong", d)).resolves.toEqual({ ok: false, message: "パスフレーズが違います" });
    expect(d.sendMessage).not.toHaveBeenCalled();
  });

  it("空のパスフレーズは解除を試さない", async () => {
    const d = deps();
    await expect(unlockAndFill("", d)).resolves.toMatchObject({ ok: false });
    expect(d.unlock).not.toHaveBeenCalled();
  });

  it("タブが分からなくても解除自体は成功として扱う（状態の切り替えだけ頼む）", async () => {
    const d = deps({ activeTabId: vi.fn().mockResolvedValue(undefined) });
    await expect(unlockAndFill("correct horse", d)).resolves.toEqual({ ok: true });
    expect(d.sendMessage).toHaveBeenCalledWith({ type: "vaultStateChanged" });
  });
});
