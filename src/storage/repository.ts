import type { Gender, Profile } from "../core/types.ts";
import {
  decryptJson,
  deriveKey,
  encryptJson,
  exportKey,
  importKey,
  newSalt,
  PBKDF2_ITERATIONS,
  type EncryptedPayload,
} from "./crypto.ts";

/**
 * プロフィールと Jev の APIキーの保存。chrome.storage への読み書きはこのモジュールだけで行う。
 *
 * - 平文（暗号化オフ）: local に `profile` と `jevApiKey`
 * - 暗号化オン: local に `vault`（両方をまとめた暗号文）だけを置く。
 *   解除中は導出した鍵を session（メモリのみ・ブラウザ終了で消える、content script からは読めない）に置く
 */

const PROFILE_KEY = "profile";
const API_KEY_KEY = "jevApiKey";
const VAULT_KEY = "vault";
const SESSION_KEY_KEY = "vaultKey";

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

/** 暗号化オン・ロック中に読み書きしようとした */
export class LockedError extends Error {
  constructor() {
    super("ロック中です");
    this.name = "LockedError";
  }
}

/** plain: 暗号化オフ / locked: 暗号化オン・未解除 / unlocked: 暗号化オン・解除中 */
export type VaultState = "plain" | "locked" | "unlocked";

interface Vault extends EncryptedPayload {
  version: 1;
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterations: number; salt: string };
}

/** 暗号化の対象（プロフィールと APIキーをまとめて1つの暗号文にする） */
interface Secrets {
  profile: Profile;
  apiKey: string;
}

/**
 * 書き込みを伴う操作を1つずつ順に実行する。
 * 保存は「全体を読む → 一部を変える → 全体を書く」なので、同時に呼ばれると後の書き込みが先の変更を消してしまうため。
 */
let pending: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const run = pending.then(operation, operation);
  pending = run.catch(() => undefined);
  return run;
}

// ---- 公開 API（呼び出し側は暗号化の有無を意識しない） ----

/**
 * 保存済みのプロフィールを読み出す。欠けた項目・不正な型は空文字で補う。
 * @throws LockedError 暗号化オン・ロック中の場合
 */
export async function getProfile(): Promise<Profile> {
  return (await readSecrets()).profile;
}

/**
 * プロフィールを保存する（各項目の前後の空白は除く）。
 * @throws LockedError 暗号化オン・ロック中の場合
 */
export function saveProfile(profile: Profile): Promise<void> {
  return serialized(async () => {
    const secrets = await readSecrets();
    await writeSecrets({ ...secrets, profile: trimProfile(profile) });
  });
}

/**
 * Jev の APIキーを読み出す。未設定なら空文字。
 * @throws LockedError 暗号化オン・ロック中の場合
 */
export async function getApiKey(): Promise<string> {
  return (await readSecrets()).apiKey;
}

/**
 * Jev の APIキーを保存する（前後の空白は除く）。
 * @throws LockedError 暗号化オン・ロック中の場合
 */
export function saveApiKey(apiKey: string): Promise<void> {
  return serialized(async () => {
    const secrets = await readSecrets();
    await writeSecrets({ ...secrets, apiKey: apiKey.trim() });
  });
}

// ---- 暗号化の管理 ----

export async function getVaultState(): Promise<VaultState> {
  if (!(await readVault())) return "plain";
  return (await readSessionKey()) ? "unlocked" : "locked";
}

/**
 * 暗号化をオンにする。今の平文データを暗号化し、平文のデータを消して解除中の状態にする。
 * vault を書いてから平文を消すので、途中で失敗しても vault が優先される（残った平文は解除時に掃除）。
 * @param iterations 鍵導出の反復回数（テスト用。本番は既定値）
 * @throws Error 既に暗号化オンの場合
 */
export function enableEncryption(passphrase: string, iterations: number = PBKDF2_ITERATIONS): Promise<void> {
  return serialized(async () => {
    if (await readVault()) throw new Error("既に暗号化されています");
    const secrets = await readPlainSecrets();
    await writeNewVault(secrets, passphrase, iterations);
    await chrome.storage.local.remove([PROFILE_KEY, API_KEY_KEY]);
  });
}

/**
 * パスフレーズでロックを解除する（ブラウザを閉じるまで有効）。
 * @throws WrongPassphraseError パスフレーズが違う場合
 */
export function unlock(passphrase: string): Promise<void> {
  return serialized(async () => {
    const vault = await requireVault();
    const key = await deriveKey(passphrase, vault.kdf.salt, vault.kdf.iterations);
    await decryptJson(key, vault);
    await chrome.storage.session.set({ [SESSION_KEY_KEY]: await exportKey(key) });
    await chrome.storage.local.remove([PROFILE_KEY, API_KEY_KEY]);
  });
}

/** すぐにロックする（解除中の鍵を捨てる） */
export async function lock(): Promise<void> {
  await chrome.storage.session.remove(SESSION_KEY_KEY);
}

/**
 * パスフレーズを変更する（新しい salt で暗号化し直す）。
 * @throws WrongPassphraseError 今のパスフレーズが違う場合
 */
export function changePassphrase(current: string, next: string, iterations: number = PBKDF2_ITERATIONS): Promise<void> {
  return serialized(async () => {
    const secrets = await decryptWithPassphrase(current);
    await writeNewVault(secrets, next, iterations);
  });
}

/**
 * 暗号化をやめて平文に戻す。
 * @throws WrongPassphraseError パスフレーズが違う場合
 */
export function disableEncryption(passphrase: string): Promise<void> {
  return serialized(async () => {
    const secrets = await decryptWithPassphrase(passphrase);
    await writePlainSecrets(secrets);
    await chrome.storage.local.remove(VAULT_KEY);
    await chrome.storage.session.remove(SESSION_KEY_KEY);
  });
}

/** パスフレーズを忘れたときの初期化。暗号化したデータごと消して、空の平文の状態に戻す */
export function resetVault(): Promise<void> {
  return serialized(async () => {
    await chrome.storage.local.remove([VAULT_KEY, PROFILE_KEY, API_KEY_KEY]);
    await chrome.storage.session.remove(SESSION_KEY_KEY);
  });
}

// ---- 内部 ----

async function readSecrets(): Promise<Secrets> {
  const vault = await readVault();
  if (!vault) return readPlainSecrets();
  const key = await readSessionKey();
  if (!key) throw new LockedError();
  return toSecrets(await decryptJson(key, vault));
}

async function writeSecrets(secrets: Secrets): Promise<void> {
  const vault = await readVault();
  if (!vault) return writePlainSecrets(secrets);
  const key = await readSessionKey();
  if (!key) throw new LockedError();
  const payload = await encryptJson(key, secrets);
  await chrome.storage.local.set({ [VAULT_KEY]: { ...vault, ...payload } satisfies Vault });
}

async function readPlainSecrets(): Promise<Secrets> {
  const profile = await readLocal(PROFILE_KEY);
  const apiKey = await readLocal(API_KEY_KEY);
  return toSecrets({ profile, apiKey });
}

async function writePlainSecrets(secrets: Secrets): Promise<void> {
  await chrome.storage.local.set({ [PROFILE_KEY]: secrets.profile, [API_KEY_KEY]: secrets.apiKey });
}

/** 新しい salt で鍵を導いて vault を書き、その鍵で解除中の状態にする */
async function writeNewVault(secrets: Secrets, passphrase: string, iterations: number): Promise<void> {
  const salt = newSalt();
  const key = await deriveKey(passphrase, salt, iterations);
  const payload = await encryptJson(key, secrets);
  const vault: Vault = { version: 1, kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt }, ...payload };
  await chrome.storage.local.set({ [VAULT_KEY]: vault });
  await chrome.storage.session.set({ [SESSION_KEY_KEY]: await exportKey(key) });
}

async function decryptWithPassphrase(passphrase: string): Promise<Secrets> {
  const vault = await requireVault();
  const key = await deriveKey(passphrase, vault.kdf.salt, vault.kdf.iterations);
  return toSecrets(await decryptJson(key, vault));
}

async function readLocal(key: string): Promise<unknown> {
  const items = await chrome.storage.local.get(key);
  return items[key];
}

async function readVault(): Promise<Vault | null> {
  const raw = await readLocal(VAULT_KEY);
  return isVault(raw) ? raw : null;
}

async function requireVault(): Promise<Vault> {
  const vault = await readVault();
  if (!vault) throw new Error("暗号化されていません");
  return vault;
}

async function readSessionKey(): Promise<CryptoKey | null> {
  const items = await chrome.storage.session.get(SESSION_KEY_KEY);
  const raw = items[SESSION_KEY_KEY];
  return typeof raw === "string" ? importKey(raw) : null;
}

function isVault(raw: unknown): raw is Vault {
  if (typeof raw !== "object" || raw === null) return false;
  const v = raw as Partial<Vault>;
  return v.version === 1 && typeof v.iv === "string" && typeof v.ciphertext === "string" && typeof v.kdf?.salt === "string";
}

/** 保存データを Secrets に整える（欠けた項目・不正な型は空で補う。古い形式のデータでも落ちないように） */
function toSecrets(raw: unknown): Secrets {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return { profile: toProfile(source["profile"]), apiKey: typeof source["apiKey"] === "string" ? source["apiKey"] : "" };
}

function toProfile(raw: unknown): Profile {
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

function trimProfile(profile: Profile): Profile {
  const trimmed = { ...profile };
  for (const key of Object.keys(trimmed) as (keyof Profile)[]) {
    if (key !== "gender") trimmed[key] = trimmed[key].trim();
  }
  return trimmed;
}
