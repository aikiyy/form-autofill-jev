/**
 * プロフィールの暗号化（Web Crypto API）。
 * パスフレーズから PBKDF2-SHA256 で AES-GCM 256bit の鍵を導き、保存のたびにランダムな IV で暗号化する。
 * AES-GCM は改ざん検知つきなので、復号の失敗をパスフレーズ違いとして扱える。
 */

/** OWASP Password Storage Cheat Sheet の推奨値（PBKDF2-HMAC-SHA256） */
export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

/** 暗号化したデータ（base64） */
export interface EncryptedPayload {
  iv: string;
  ciphertext: string;
}

/** パスフレーズが違う（または暗号文が壊れている）ため復号できない */
export class WrongPassphraseError extends Error {
  constructor() {
    super("パスフレーズが違います");
    this.name = "WrongPassphraseError";
  }
}

/** 鍵導出用のランダムな salt（base64） */
export function newSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/**
 * パスフレーズから AES-GCM の鍵を導く。
 * 解除中の鍵を storage.session に置くため、書き出し可能（extractable）にする。
 */
export async function deriveKey(passphrase: string, salt: string, iterations: number = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

/** JSON にできる値を暗号化する（IV は毎回ランダム） */
export async function encryptJson(key: CryptoKey, data: unknown): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) };
}

/**
 * 暗号文を復号して JSON として読む。
 * @throws WrongPassphraseError 鍵が違う・暗号文が壊れている場合
 */
export async function decryptJson(key: CryptoKey, payload: EncryptedPayload): Promise<unknown> {
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.ciphertext),
    );
  } catch {
    throw new WrongPassphraseError();
  }
  return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
}

/** 鍵を base64 で書き出す（storage.session に置くため） */
export async function exportKey(key: CryptoKey): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.exportKey("raw", key)));
}

/** exportKey で書き出した鍵を読み戻す */
export async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", fromBase64(raw), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
