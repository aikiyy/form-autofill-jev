import type { FieldDescriptor, FieldOption, Gender } from "./types.ts";

// ---- 文字種の変換 ----

/** カタカナをひらがなにする（長音・中黒などはそのまま） */
export function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** ひらがなをカタカナにする */
export function toKatakana(text: string): string {
  return text.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** 半角の英数字・記号・空白を全角にする */
export function toFullWidth(text: string): string {
  return text.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/ /g, "　");
}

/** 全角の英数字・記号・空白を半角にする */
export function toHalfWidth(text: string): string {
  return text.replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/　/g, " ");
}

/** 欄の書式指定の手がかりになるテキスト */
function hintText(field: FieldDescriptor): string {
  return `${field.label} ${field.ariaLabel} ${field.nearbyText} ${field.placeholder}`;
}

/**
 * 欄の「全角」「半角」指定に合わせて英数字の幅を変える。
 * @returns 変換後の値。対応できない指定（半角カナ）なら null
 */
export function applyWidth(value: string, field: FieldDescriptor): string | null {
  const hint = hintText(field);
  if (/半角(カナ|カタカナ)|ｶﾅ|ｶﾀｶﾅ/.test(hint)) return null;
  if (/全角/.test(hint)) return toFullWidth(value);
  if (/半角/.test(hint)) return toHalfWidth(value);
  return value;
}

/**
 * カタカナで保存したフリガナを、欄の指定に合わせてひらがな/カタカナにする。
 * 「カタカナ」「フリガナ」の明示を優先し、次に「ふりがな」「ひらがな」やひらがなの placeholder を見る。
 */
export function formatKana(katakana: string, field: FieldDescriptor): string {
  const text = `${field.label} ${field.ariaLabel} ${field.nearbyText}`;
  if (/カタカナ|カナ|フリガナ/.test(text)) return toKatakana(katakana);
  if (/ふりがな|ひらがな/.test(text) || /^[ぁ-ゖー\s　・]+$/.test(field.placeholder)) return toHiragana(katakana);
  return toKatakana(katakana);
}

// ---- 電話番号・郵便番号 ----

const HYPHENS = /[-‐‑–—−ー－]/g;

/**
 * 1欄に入れるときにハイフンを付けるか。
 * 明示の「ハイフンなし／あり」を優先し、次に placeholder の例を見る。既定はなし。
 */
function wantsHyphen(field: FieldDescriptor): boolean {
  const hint = hintText(field);
  if (/ハイフン(なし|無し|不要|を除|を入れず|を入れない|抜き|は不要)/.test(hint)) return false;
  if (/ハイフン(あり|有り|付き|を含|を入れて|必要)/.test(hint)) return true;
  return /\d[-－‐−]\d/.test(field.placeholder);
}

function digitsOnly(text: string): string {
  return toHalfWidth(text).replace(/\D/g, "");
}

/**
 * 電話番号を3分割する。ユーザーが書いたハイフン位置を使い、なければ携帯・IP電話（0X0 + 8桁）だけ 3-4-4 で分ける。
 * @returns 分割できなければ null（固定電話は市外局番の桁数が地域で違うため推測しない）
 */
export function splitTel(tel: string): [string, string, string] | null {
  const parts = toHalfWidth(tel).replace(HYPHENS, "-").split("-").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) return [parts[0]!, parts[1]!, parts[2]!];
  const digits = digitsOnly(tel);
  const mobile = /^(0[5789]0)(\d{4})(\d{4})$/.exec(digits);
  return mobile ? [mobile[1]!, mobile[2]!, mobile[3]!] : null;
}

/** 電話番号を1欄用に整形する（ハイフンの有無は欄に合わせる） */
export function formatTel(tel: string, field: FieldDescriptor): string {
  if (!wantsHyphen(field)) return digitsOnly(tel);
  return splitTel(tel)?.join("-") ?? toHalfWidth(tel).replace(HYPHENS, "-");
}

/** 郵便番号を 3桁・4桁に分ける。7桁でなければ null */
export function splitPostal(postal: string): [string, string] | null {
  const digits = digitsOnly(postal);
  return digits.length === 7 ? [digits.slice(0, 3), digits.slice(3)] : null;
}

/** 郵便番号を1欄用に整形する。7桁でなければ null */
export function formatPostal(postal: string, field: FieldDescriptor): string | null {
  const parts = splitPostal(postal);
  if (!parts) return null;
  return wantsHyphen(field) ? parts.join("-") : parts.join("");
}

// ---- 日付 ----

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 生年月日（YYYY-MM-DD）を1欄用に整形する。type=date はそのまま、テキスト欄は placeholder の書式に合わせる。
 * @returns 不正な日付なら null
 */
export function formatDate(date: string, field: FieldDescriptor): string | null {
  const m = ISO_DATE.exec(date);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (field.type === "date") return date;
  const placeholder = toHalfWidth(field.placeholder);
  if (/^\d{8}$/.test(placeholder)) return `${y}${mo}${d}`;
  if (/\d{4}年/.test(placeholder)) return `${y}年${mo}月${d}日`;
  const sep = /\d{4}([/\-.])\d{1,2}/.exec(placeholder)?.[1] ?? "/";
  return `${y}${sep}${mo}${sep}${d}`;
}

/**
 * 生年月日（YYYY-MM-DD）から、指定日時点の満年齢を計算する（誕生日当日に1つ増える）。
 * @returns 不正な日付・指定日より後の生年月日なら null
 */
export function calcAge(birthDate: string, today: Date): number | null {
  const m = ISO_DATE.exec(birthDate);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const beforeBirthday = today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d);
  const age = today.getFullYear() - y - (beforeBirthday ? 1 : 0);
  return age >= 0 ? age : null;
}

/** 生年月日の年・月・日を select で選ぶときの候補（「5」「05」「5月」など） */
export function datePartCandidates(part: "year" | "month" | "day", date: string): string[] {
  const m = ISO_DATE.exec(date);
  if (!m) return [];
  if (part === "year") return [m[1]!, `${m[1]}年`];
  const padded = part === "month" ? m[2]! : m[3]!;
  const plain = String(Number(padded));
  const suffix = part === "month" ? "月" : "日";
  return [...new Set([plain, padded, `${plain}${suffix}`, `${padded}${suffix}`])];
}

// ---- select / radio の選択肢 ----

function normalizeOption(text: string): string {
  return toHalfWidth(text).replace(/\s+/g, "").toLowerCase();
}

/**
 * 候補のどれかに一致する選択肢を探す。テキストで照合し、見つからなければ value でも照合する。
 * @returns 一致した選択肢の value。なければ null
 */
export function matchOption(options: readonly FieldOption[], candidates: readonly string[]): string | null {
  const wanted = new Set(candidates.map(normalizeOption));
  if (wanted.size === 0) return null;
  const byText = options.find((o) => wanted.has(normalizeOption(o.text)));
  if (byText) return byText.value;
  return options.find((o) => o.value !== "" && wanted.has(normalizeOption(o.value)))?.value ?? null;
}

const GENDER_CANDIDATES: Record<Exclude<Gender, "">, string[]> = {
  male: ["男性", "男", "男子", "male", "m", "man"],
  female: ["女性", "女", "女子", "female", "f", "woman"],
  // 「回答しない」は「その他」と意味が違うので候補に入れない
  other: ["その他", "other"],
};

export function genderCandidates(gender: Gender): string[] {
  return gender ? GENDER_CANDIDATES[gender] : [];
}

/** 都道府県の候補（「東京都」と「東京」の両方。北海道は省略しない） */
export function prefectureCandidates(prefecture: string): string[] {
  if (!prefecture) return [];
  const short = prefecture !== "北海道" && /[都府県]$/.test(prefecture) ? prefecture.slice(0, -1) : null;
  return short ? [prefecture, short] : [prefecture];
}
