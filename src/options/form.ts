import { splitPostal, splitTel, toHalfWidth, toKatakana } from "../core/format.ts";
import type { Profile } from "../core/types.ts";

export interface ValidationError {
  key: keyof Profile;
  message: string;
}

const HYPHENS = /[-‐‑–—−ー－]/g;

/**
 * 保存前にプロフィールの表記をそろえる。
 * フリガナはカタカナに、電話番号は半角のハイフン区切りに、郵便番号は 000-0000 に、旅券番号・ローマ字は半角大文字にする。
 */
export function normalizeProfile(profile: Profile): Profile {
  const tel = toHalfWidth(profile.tel).replace(HYPHENS, "-").replace(/\s+/g, "");
  const postal = splitPostal(profile.postalCode);
  return {
    ...profile,
    lastNameKana: toKatakana(profile.lastNameKana),
    firstNameKana: toKatakana(profile.firstNameKana),
    tel,
    postalCode: postal ? postal.join("-") : profile.postalCode,
    passportNumber: toUpperHalf(profile.passportNumber),
    lastNameRoman: toUpperHalf(profile.lastNameRoman),
    firstNameRoman: toUpperHalf(profile.firstNameRoman),
  };
}

/** 旅券番号・ローマ字: 半角の大文字にし、前後の空白を除く */
function toUpperHalf(value: string): string {
  return toHalfWidth(value).trim().toUpperCase();
}

const ROMAN_NAME = /^[A-Z][A-Z '-]*$/;
const KATAKANA_ONLY = /^[゠-ヿ\s　]+$/;

/**
 * 自動入力で使えない値を見つける。空欄はエラーにしない（その項目は入力しないだけ）。
 * @returns 項目ごとのエラー。問題なければ空配列
 */
export function validateProfile(p: Profile): ValidationError[] {
  const errors: ValidationError[] = [];
  const check = (key: keyof Profile, ok: boolean, message: string) => {
    if (p[key] !== "" && !ok) errors.push({ key, message });
  };
  check("email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email), "メールアドレスの形式が正しくありません");
  check(
    "tel",
    splitTel(p.tel) !== null,
    "市外局番の区切りが分かるよう、ハイフン区切りで入力してください（例: 03-1234-5678）",
  );
  check("postalCode", splitPostal(p.postalCode) !== null, "郵便番号は7桁で入力してください");
  check("lastNameKana", KATAKANA_ONLY.test(p.lastNameKana), "カタカナで入力してください");
  check("firstNameKana", KATAKANA_ONLY.test(p.firstNameKana), "カタカナで入力してください");
  check("birthDate", /^\d{4}-\d{2}-\d{2}$/.test(p.birthDate), "生年月日を正しく入力してください");
  // 日本の旅券は英字2＋数字7桁。外国の旅券も考慮して英数字6〜12文字まで許す
  check("passportNumber", /^[A-Z0-9]{6,12}$/.test(p.passportNumber), "旅券番号は英数字で入力してください");
  check("passportExpiry", /^\d{4}-\d{2}-\d{2}$/.test(p.passportExpiry), "有効期限を正しく入力してください");
  check("lastNameRoman", ROMAN_NAME.test(p.lastNameRoman), "ローマ字（英大文字）で入力してください");
  check("firstNameRoman", ROMAN_NAME.test(p.firstNameRoman), "ローマ字（英大文字）で入力してください");
  return errors;
}

const PASSPHRASE_MIN = 8;

/**
 * 新しいパスフレーズを検証する。
 * @returns 問題があればエラーメッセージ、なければ null
 */
export function validatePassphrase(passphrase: string, confirmation: string): string | null {
  if (passphrase.length < PASSPHRASE_MIN) return `パスフレーズは${PASSPHRASE_MIN}文字以上にしてください`;
  if (passphrase !== confirmation) return "確認用のパスフレーズが一致しません";
  return null;
}
