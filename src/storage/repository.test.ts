// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../core/types.ts";
import { WrongPassphraseError } from "./crypto.ts";
import {
  changePassphrase,
  disableEncryption,
  EMPTY_PROFILE,
  enableEncryption,
  getApiKey,
  getProfile,
  getVaultState,
  lock,
  LockedError,
  resetVault,
  saveApiKey,
  saveProfile,
  unlock,
} from "./repository.ts";

/** テストでは鍵導出の反復回数を小さくして速くする */
const ITERATIONS = 1000;

let store: Record<string, unknown>;
let session: Record<string, unknown>;

function memoryArea(data: () => Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string) => (key in data() ? { [key]: data()[key] } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(data(), items)),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const k of [keys].flat()) delete data()[k];
    }),
  };
}

beforeEach(() => {
  store = {};
  session = {};
  vi.stubGlobal("chrome", { storage: { local: memoryArea(() => store), session: memoryArea(() => session) } });
});

const profile: Profile = {
  ...EMPTY_PROFILE,
  lastName: "山田",
  firstName: "太郎",
  tel: "090-1234-5678",
  gender: "male",
  passportNumber: "TK1234567",
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

describe("同時保存", () => {
  it("プロフィールと APIキーを同時に保存しても、どちらも失われない", async () => {
    await Promise.all([saveProfile(profile), saveApiKey("sk-new")]);
    await expect(getProfile()).resolves.toEqual(profile);
    await expect(getApiKey()).resolves.toBe("sk-new");
  });

  it("暗号化オンでも同時保存でどちらも失われない", async () => {
    await enableEncryption("correct horse", ITERATIONS);
    await Promise.all([saveProfile({ ...profile, city: "渋谷区" }), saveApiKey("sk-new")]);
    await expect(getProfile()).resolves.toMatchObject({ city: "渋谷区" });
    await expect(getApiKey()).resolves.toBe("sk-new");
  });
});

describe("エラー", () => {
  it("storage の失敗はそのまま呼び出し元に伝える", async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error("quota"));
    await expect(getProfile()).rejects.toThrow("quota");
  });
});

describe("暗号化", () => {
  beforeEach(async () => {
    await saveProfile(profile);
    await saveApiKey("sk-test");
  });

  it("暗号化前は plain", async () => {
    await expect(getVaultState()).resolves.toBe("plain");
  });

  it("暗号化すると平文の保存データが消え、旅券番号も APIキーも local に平文で残らない", async () => {
    await enableEncryption("correct horse", ITERATIONS);

    expect(Object.keys(store)).toEqual(["vault"]);
    expect(JSON.stringify(store)).not.toContain("TK1234567");
    expect(JSON.stringify(store)).not.toContain("sk-test");
    await expect(getVaultState()).resolves.toBe("unlocked");
    await expect(getProfile()).resolves.toEqual(profile);
    await expect(getApiKey()).resolves.toBe("sk-test");
  });

  it("ロック中は読み書きできず LockedError", async () => {
    await enableEncryption("correct horse", ITERATIONS);
    await lock();

    await expect(getVaultState()).resolves.toBe("locked");
    await expect(getProfile()).rejects.toBeInstanceOf(LockedError);
    await expect(getApiKey()).rejects.toBeInstanceOf(LockedError);
    await expect(saveProfile(profile)).rejects.toBeInstanceOf(LockedError);
  });

  it("パスフレーズが違えば解除できず、正しければ解除できる", async () => {
    await enableEncryption("correct horse", ITERATIONS);
    await lock();

    await expect(unlock("wrong horse")).rejects.toBeInstanceOf(WrongPassphraseError);
    await expect(getVaultState()).resolves.toBe("locked");

    await unlock("correct horse");
    await expect(getVaultState()).resolves.toBe("unlocked");
    await expect(getProfile()).resolves.toEqual(profile);
  });

  it("解除中に保存しても暗号文のまま（平文のキーを書かない）", async () => {
    await enableEncryption("correct horse", ITERATIONS);
    const before = JSON.stringify(store["vault"]);

    await saveProfile({ ...profile, city: "渋谷区" });

    expect(Object.keys(store)).toEqual(["vault"]);
    expect(JSON.stringify(store["vault"])).not.toBe(before);
    await expect(getProfile()).resolves.toMatchObject({ city: "渋谷区", passportNumber: "TK1234567" });
  });

  it("解除時に、移行途中で残った平文のキーを掃除する", async () => {
    await enableEncryption("correct horse", ITERATIONS);
    await lock();
    store["profile"] = profile;

    await unlock("correct horse");

    expect(Object.keys(store)).toEqual(["vault"]);
  });

  it("パスフレーズを変更すると、古いパスフレーズでは解除できない", async () => {
    await enableEncryption("correct horse", ITERATIONS);
    await expect(changePassphrase("wrong", "battery staple", ITERATIONS)).rejects.toBeInstanceOf(WrongPassphraseError);

    await changePassphrase("correct horse", "battery staple", ITERATIONS);
    await lock();

    await expect(unlock("correct horse")).rejects.toBeInstanceOf(WrongPassphraseError);
    await unlock("battery staple");
    await expect(getProfile()).resolves.toEqual(profile);
  });

  it("暗号化をやめると平文に戻る（パスフレーズで確認する）", async () => {
    await enableEncryption("correct horse", ITERATIONS);
    await expect(disableEncryption("wrong")).rejects.toBeInstanceOf(WrongPassphraseError);

    await disableEncryption("correct horse");

    await expect(getVaultState()).resolves.toBe("plain");
    expect(store["vault"]).toBeUndefined();
    expect(session).toEqual({});
    await expect(getProfile()).resolves.toEqual(profile);
    await expect(getApiKey()).resolves.toBe("sk-test");
  });

  it("リセットすると暗号化したデータごと消えて空の状態に戻る", async () => {
    await enableEncryption("correct horse", ITERATIONS);
    await lock();

    await resetVault();

    await expect(getVaultState()).resolves.toBe("plain");
    await expect(getProfile()).resolves.toEqual(EMPTY_PROFILE);
    expect(store).toEqual({});
  });

  it("暗号化済みならもう一度暗号化はできない", async () => {
    await enableEncryption("correct horse", ITERATIONS);
    await expect(enableEncryption("again", ITERATIONS)).rejects.toThrow();
  });
});

