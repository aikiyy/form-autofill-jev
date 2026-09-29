import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../core/types.ts";
import { EMPTY_PROFILE, getApiKey, getProfile, saveApiKey, saveProfile } from "./repository.ts";

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(store, items)),
      },
    },
  });
});

const profile: Profile = {
  ...EMPTY_PROFILE,
  lastName: "山田",
  firstName: "太郎",
  tel: "090-1234-5678",
  gender: "male",
};

describe("profile", () => {
  it("未保存なら全項目が空のプロフィールを返す", async () => {
    await expect(getProfile()).resolves.toEqual(EMPTY_PROFILE);
  });

  it("保存したプロフィールを読み出せる", async () => {
    await saveProfile(profile);
    await expect(getProfile()).resolves.toEqual(profile);
  });

  it("保存データに欠けた項目・不正な型があれば空で補う", async () => {
    store["profile"] = { lastName: "山田", firstName: 123, gender: "unknown", extra: "x" };
    await expect(getProfile()).resolves.toEqual({ ...EMPTY_PROFILE, lastName: "山田" });
  });

  it("保存時に前後の空白を取り除く", async () => {
    await saveProfile({ ...profile, email: "  yamada@example.com " });
    await expect(getProfile()).resolves.toMatchObject({ email: "yamada@example.com" });
  });
});

describe("apiKey", () => {
  it("未保存なら空文字", async () => {
    await expect(getApiKey()).resolves.toBe("");
  });

  it("前後の空白を取り除いて保存する", async () => {
    await saveApiKey("  sk-test  ");
    await expect(getApiKey()).resolves.toBe("sk-test");
  });
});

describe("エラー", () => {
  it("storage の失敗はそのまま呼び出し元に伝える", async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error("quota"));
    await expect(getProfile()).rejects.toThrow("quota");
  });
});
