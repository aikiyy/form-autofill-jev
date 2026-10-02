// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptJson, deriveKey, encryptJson, exportKey, importKey, newSalt, WrongPassphraseError } from "./crypto.ts";

// テストでは反復回数を小さくして速くする（本番は PBKDF2_ITERATIONS）
const ITERATIONS = 1000;

describe("crypto", () => {
  it("同じパスフレーズ・salt から導いた鍵で暗号化と復号が往復する", async () => {
    const salt = newSalt();
    const key = await deriveKey("correct horse", salt, ITERATIONS);
    const payload = await encryptJson(key, { passportNumber: "TK1234567" });

    expect(payload.ciphertext).not.toContain("TK1234567");
    const again = await deriveKey("correct horse", salt, ITERATIONS);
    await expect(decryptJson(again, payload)).resolves.toEqual({ passportNumber: "TK1234567" });
  });

  it("パスフレーズが違うと WrongPassphraseError", async () => {
    const salt = newSalt();
    const payload = await encryptJson(await deriveKey("correct horse", salt, ITERATIONS), { a: 1 });
    const wrong = await deriveKey("wrong horse", salt, ITERATIONS);

    await expect(decryptJson(wrong, payload)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it("暗号化のたびに IV が変わり、salt も毎回ランダム", async () => {
    const key = await deriveKey("p", newSalt(), ITERATIONS);
    const a = await encryptJson(key, { x: 1 });
    const b = await encryptJson(key, { x: 1 });

    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(newSalt()).not.toBe(newSalt());
  });

  it("鍵を base64 で書き出して読み戻しても復号できる（storage.session に置くため）", async () => {
    const key = await deriveKey("p", newSalt(), ITERATIONS);
    const payload = await encryptJson(key, { y: "z" });
    const restored = await importKey(await exportKey(key));

    await expect(decryptJson(restored, payload)).resolves.toEqual({ y: "z" });
  });
});
