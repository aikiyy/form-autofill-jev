import { splitPostal, splitTel, toHalfWidth, toKatakana } from "../core/format.ts";
import type { Profile } from "../core/types.ts";

export interface ValidationError {
  key: keyof Profile;
  message: string;
}

const HYPHENS = /[-‐‑–—−ー－]/g;

/**
 * 保存前にプロフィールの表記をそろえる。
 * フリガナはカタカナに、電話番号は半角のハイフン区切りに、郵便番号は 000-0000 にする。
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
  };
}

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
  return errors;
}
