import type { Gender, Profile } from "../core/types.ts";

/**
 * chrome.storage.local への読み書きはこのモジュールだけで行う。
 * MVP は平文で保存する。暗号化を入れるときは readItem / writeItem を差し替える。
 */

const PROFILE_KEY = "profile";
const API_KEY_KEY = "jevApiKey";

export const EMPTY_PROFILE: Readonly<Profile> = Object.freeze({
  lastName: "",
  firstName: "",
  lastNameKana: "",
  firstNameKana: "",
  email: "",
  tel: "",
  postalCode: "",
  prefecture: "",
  city: "",
  street: "",
  building: "",
  birthDate: "",
  gender: "",
  passportNumber: "",
  passportExpiry: "",
  lastNameRoman: "",
  firstNameRoman: "",
});

const GENDERS: readonly Gender[] = ["male", "female", "other", ""];

async function readItem(key: string): Promise<unknown> {
  const items = await chrome.storage.local.get(key);
  return items[key];
}

async function writeItem(key: string, value: unknown): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/**
 * 保存済みのプロフィールを読み出す。
 * 未保存・欠けた項目・不正な型は空文字で補う（古い形式のデータでも落ちないように）。
 * @throws chrome.storage の読み出しに失敗した場合
 */
export async function getProfile(): Promise<Profile> {
  const raw = await readItem(PROFILE_KEY);
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const profile: Profile = { ...EMPTY_PROFILE };
  for (const key of Object.keys(EMPTY_PROFILE) as (keyof Profile)[]) {
    const value = source[key];
    if (typeof value !== "string") continue;
    if (key === "gender") {
      if ((GENDERS as readonly string[]).includes(value)) profile.gender = value as Gender;
    } else {
      profile[key] = value;
    }
  }
  return profile;
}

/**
 * プロフィールを保存する（各項目の前後の空白は除く）。
 * @throws chrome.storage の書き込みに失敗した場合
 */
export async function saveProfile(profile: Profile): Promise<void> {
  const trimmed = { ...profile };
  for (const key of Object.keys(trimmed) as (keyof Profile)[]) {
    if (key !== "gender") trimmed[key] = trimmed[key].trim();
  }
  await writeItem(PROFILE_KEY, trimmed);
}

/**
 * Jev の APIキーを読み出す。未設定なら空文字。
 * @throws chrome.storage の読み出しに失敗した場合
 */
export async function getApiKey(): Promise<string> {
  const value = await readItem(API_KEY_KEY);
  return typeof value === "string" ? value : "";
}

/**
 * Jev の APIキーを保存する（前後の空白は除く）。
 * @throws chrome.storage の書き込みに失敗した場合
 */
export async function saveApiKey(apiKey: string): Promise<void> {
  await writeItem(API_KEY_KEY, apiKey.trim());
}
