import {
  applyWidth,
  calcAge,
  datePartCandidates,
  formatDate,
  formatKana,
  formatPostal,
  formatTel,
  genderCandidates,
  matchOption,
  prefectureCandidates,
  splitPostal,
  splitTel,
} from "./format.ts";
import type { Assignment, FieldDescriptor, FieldKey, FillInstruction, Profile } from "./types.ts";

/**
 * これ以上の確信度なら自動入力する。
 * T7 の spike（5フィクスチャ36欄）で 0.85〜0.9 のとき誤入力 0・自動入力 34/35 だったため 0.85 とした。
 */
export const CONFIDENCE_THRESHOLD = 0.85;

/** 隣り合う複数の欄に分けて入力する項目 */
const SPLIT_KEYS: ReadonlySet<FieldKey> = new Set(["tel", "postalCode", "birthDate"]);
/** 隣り合う複数の欄に同じ値を入れてよい項目（メールアドレスと確認用） */
const REPEATABLE_KEYS: ReadonlySet<FieldKey> = new Set(["email"]);

const REASON = {
  lowConfidence: "項目の判定に自信がありません",
  noOption: "選択肢に該当するものがありません",
  cannotSplit: "分割のしかたが分かりません（電話番号はプロフィールにハイフン区切りで保存してください）",
  duplicated: "同じ項目の欄が並んでいて、どれに入れるか決められません",
  unsupportedFormat: "この欄の書式（半角カナ等）には対応していません",
  invalidValue: "プロフィールの値がこの欄の形式に合いません",
  textGender: "性別の表記が決められません",
} as const;

interface Target {
  field: FieldDescriptor;
  assignment: Assignment;
}

export interface ResolveOptions {
  /** 自動入力する確信度の下限（既定: CONFIDENCE_THRESHOLD） */
  threshold?: number;
  /** 年齢を計算する基準日（既定: 現在日時） */
  today?: Date | undefined;
}

/** 欄ごとの値の決定に使う共通の情報 */
interface Context {
  profile: Profile;
  presentKeys: ReadonlySet<FieldKey>;
  today: Date;
}

/**
 * 判定結果とプロフィールから、欄ごとの入力指示を作る。
 * 誤入力を防ぐため、確信度が低い・分割できない・選択肢が一致しない欄は入力せず要確認（review）にする。
 * @param fields ページ内の全欄（出現順の判定に使う）
 * @param assignments ルールと Jev の判定結果（同じ欄に両方あればルールを優先）
 * @param profile 保存済みのプロフィール
 * @param options 確信度の下限・年齢の基準日
 * @returns 出現順の入力指示。none の欄・プロフィールが空の項目は含まない
 */
export function resolveFills(
  fields: readonly FieldDescriptor[],
  assignments: readonly Assignment[],
  profile: Profile,
  options: ResolveOptions = {},
): FillInstruction[] {
  const threshold = options.threshold ?? CONFIDENCE_THRESHOLD;
  const merged = mergeAssignments(assignments);
  const ctx: Context = {
    profile,
    presentKeys: new Set([...merged.values()].map((a) => a.key)),
    today: options.today ?? new Date(),
  };
  const ordered = [...fields].sort((a, b) => a.index - b.index);
  const out: FillInstruction[] = [];

  for (const group of groupAdjacent(ordered, merged)) {
    const key = group[0]!.assignment.key;
    if (key === "none" || !hasValue(key, profile)) continue;
    if (group.some((t) => t.assignment.confidence < threshold)) {
      out.push(...group.map((t) => review(t.field, REASON.lowConfidence)));
      continue;
    }
    out.push(...resolveGroup(key, group.map((t) => t.field), ctx));
  }
  return out;
}

/** 同じ欄の判定はルールを優先し、次に確信度の高いものを採る */
function mergeAssignments(assignments: readonly Assignment[]): Map<string, Assignment> {
  const merged = new Map<string, Assignment>();
  for (const a of assignments) {
    const current = merged.get(a.fieldId);
    const better =
      !current ||
      (a.source === "rule" && current.source !== "rule") ||
      (a.source === current.source && a.confidence > current.confidence);
    if (better) merged.set(a.fieldId, a);
  }
  return merged;
}

/** 出現順で隣り合い、同じ項目と判定された欄をまとめる */
function groupAdjacent(ordered: readonly FieldDescriptor[], merged: ReadonlyMap<string, Assignment>): Target[][] {
  const groups: Target[][] = [];
  let current: Target[] = [];
  for (const field of ordered) {
    const assignment = merged.get(field.id);
    const last = current.at(-1);
    if (assignment && last && last.assignment.key === assignment.key) {
      current.push({ field, assignment });
      continue;
    }
    if (current.length) groups.push(current);
    current = assignment ? [{ field, assignment }] : [];
  }
  if (current.length) groups.push(current);
  return groups;
}

function hasValue(key: FieldKey, p: Profile): boolean {
  switch (key) {
    case "fullName":
      return Boolean(p.lastName || p.firstName);
    case "fullNameKana":
      return Boolean(p.lastNameKana || p.firstNameKana);
    case "address":
      return Boolean(p.prefecture || p.city || p.street || p.building);
    case "age":
      return p.birthDate !== "";
    case "none":
      return false;
    default:
      return p[key] !== "";
  }
}

function resolveGroup(key: FieldKey, fields: readonly FieldDescriptor[], ctx: Context): FillInstruction[] {
  const { profile } = ctx;
  if (fields.length === 1) return [resolveSingle(key, fields[0]!, ctx)];
  if (REPEATABLE_KEYS.has(key)) return fields.map((f) => resolveSingle(key, f, ctx));
  if (!SPLIT_KEYS.has(key)) return fields.map((f) => review(f, REASON.duplicated));

  if (key === "tel" && fields.length === 3) return fillParts(fields, splitTel(profile.tel));
  if (key === "postalCode" && fields.length === 2) return fillParts(fields, splitPostal(profile.postalCode));
  if (key === "birthDate" && fields.length <= 3) return resolveBirthParts(fields, profile.birthDate);
  return fields.map((f) => review(f, REASON.cannotSplit));
}

function fillParts(fields: readonly FieldDescriptor[], parts: readonly string[] | null): FillInstruction[] {
  if (!parts || parts.length !== fields.length) return fields.map((f) => review(f, REASON.cannotSplit));
  return fields.map((f, i) => textValue(f, parts[i]!));
}

function resolveSingle(key: FieldKey, field: FieldDescriptor, ctx: Context): FillInstruction {
  const { profile: p, presentKeys } = ctx;
  switch (key) {
    case "lastName":
    case "firstName":
    case "email":
    case "city":
    case "street":
    case "building":
      return textValue(field, p[key]);
    case "fullName":
      return textValue(field, joinName(p.lastName, p.firstName));
    case "lastNameKana":
    case "firstNameKana":
      return textValue(field, formatKana(p[key], field));
    case "fullNameKana":
      return textValue(field, formatKana(joinName(p.lastNameKana, p.firstNameKana), field));
    case "tel":
      return textValue(field, formatTel(p.tel, field));
    case "postalCode": {
      const value = formatPostal(p.postalCode, field);
      return value === null ? review(field, REASON.invalidValue) : textValue(field, value);
    }
    case "prefecture":
      return isChoice(field) ? choiceValue(field, prefectureCandidates(p.prefecture)) : textValue(field, p.prefecture);
    case "address":
      return textValue(field, composeAddress(p, presentKeys));
    case "birthDate": {
      if (isChoice(field)) return review(field, REASON.cannotSplit);
      const value = formatDate(p.birthDate, field);
      return value === null ? review(field, REASON.invalidValue) : textValue(field, value);
    }
    case "age": {
      const age = calcAge(p.birthDate, ctx.today);
      if (age === null) return review(field, REASON.invalidValue);
      return isChoice(field) ? choiceValue(field, [String(age), `${age}歳`]) : textValue(field, String(age));
    }
    case "gender":
      return isChoice(field) ? choiceValue(field, genderCandidates(p.gender)) : review(field, REASON.textGender);
    case "none":
      return review(field, REASON.lowConfidence);
  }
}

function joinName(last: string, first: string): string {
  return [last, first].filter(Boolean).join(" ");
}

/** 住所1欄。都道府県・市区町村・番地・建物名のうち、別の欄があるものは含めない */
function composeAddress(p: Profile, presentKeys: ReadonlySet<FieldKey>): string {
  const main = (["prefecture", "city", "street"] as const)
    .filter((k) => !presentKeys.has(k))
    .map((k) => p[k])
    .join("");
  const building = presentKeys.has("building") ? "" : p.building;
  return [main, building].filter(Boolean).join(" ");
}

type DatePart = "year" | "month" | "day";

/** 生年月日の分割欄（select または input）に年・月・日を割り当てて入力する */
function resolveBirthParts(fields: readonly FieldDescriptor[], birthDate: string): FillInstruction[] {
  const roles = assignDateRoles(fields);
  if (!roles) return fields.map((f) => review(f, REASON.cannotSplit));
  return fields.map((f, i) => {
    const role = roles[i]!;
    if (isChoice(f)) return choiceValue(f, datePartCandidates(role, birthDate));
    const value = datePartText(role, birthDate, f);
    return value === null ? review(f, REASON.invalidValue) : textValue(f, value);
  });
}

/**
 * 各欄が年・月・日のどれかを決める。
 * 優先順: 直後のテキスト（年/月/日）・ラベルの括弧書き → 選択肢の値の範囲 → 残りを出現順に 年→月→日。
 * @returns 役割が重複するなど決められなければ null
 */
function assignDateRoles(fields: readonly FieldDescriptor[]): DatePart[] | null {
  const roles: (DatePart | null)[] = fields.map((f) => roleFromText(f) ?? roleFromOptions(f));
  const used = new Set(roles.filter((r): r is DatePart => r !== null));
  if (used.size !== roles.filter((r) => r !== null).length) return null;
  const remaining = (["year", "month", "day"] as const).filter((r) => !used.has(r));
  const filled = roles.map((r) => r ?? remaining.shift() ?? null);
  return filled.every((r): r is DatePart => r !== null) ? filled : null;
}

const ROLE_BY_CHAR: Record<string, DatePart> = { 年: "year", 月: "month", 日: "day" };

function roleFromText(field: FieldDescriptor): DatePart | null {
  const after = field.nearbyText.trim().charAt(0);
  if (ROLE_BY_CHAR[after]) return ROLE_BY_CHAR[after];
  // 「生年月日（月）」や、分割欄の項目名の末尾に付いた「生年月日 月」
  const unit = /[（(](年|月|日)[)）]|(?:^|\s)(年|月|日)$/.exec(field.label.trim());
  return unit ? ROLE_BY_CHAR[(unit[1] ?? unit[2])!]! : null;
}

function roleFromOptions(field: FieldDescriptor): DatePart | null {
  const numbers = (field.options ?? [])
    .map((o) => Number.parseInt(o.value || o.text, 10))
    .filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return null;
  const max = Math.max(...numbers);
  if (max >= 1900) return "year";
  if (max > 12) return "day";
  return "month";
}

function datePartText(role: DatePart, birthDate: string, field: FieldDescriptor): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!m) return null;
  if (role === "year") return m[1]!;
  const padded = role === "month" ? m[2]! : m[3]!;
  const wantsPadding = /^0\d/.test(field.placeholder) || field.maxLength === 2;
  return wantsPadding ? padded : String(Number(padded));
}

function isChoice(field: FieldDescriptor): boolean {
  return (field.tag === "select" || field.type === "radio") && Boolean(field.options?.length);
}

/** テキスト欄なら幅を合わせて入力、select/radio なら選択肢と照合する */
function textValue(field: FieldDescriptor, value: string): FillInstruction {
  if (isChoice(field)) return choiceValue(field, [value]);
  const formatted = applyWidth(value, field);
  return formatted === null ? review(field, REASON.unsupportedFormat) : { fieldId: field.id, status: "fill", value: formatted };
}

function choiceValue(field: FieldDescriptor, candidates: readonly string[]): FillInstruction {
  const value = matchOption(field.options ?? [], candidates);
  return value === null ? review(field, REASON.noOption) : { fieldId: field.id, status: "fill", value };
}

function review(field: FieldDescriptor, reason: string): FillInstruction {
  return { fieldId: field.id, status: "review", reason };
}
