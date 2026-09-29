import {
  choice,
  type ChoiceCriteria,
  type JsonValue,
  type Questions,
  type SystemOneRequest,
  type SystemOneResult,
} from "@typesafe-ai/sdk";
import { FIELD_KEYS, type Assignment, type FieldDescriptor, type FieldKey } from "./types.ts";

export const JEV_MODEL = "jev-latest";

/** state に載せる select / radio の選択肢の上限（トークン節約） */
const MAX_OPTIONS_IN_STATE = 60;

/** Choice の選択肢ごとの説明。Jev は英語が得意なので英語を主にし、日本語の表記例を添える */
export const FIELD_KEY_CRITERIA: Record<FieldKey, string> = {
  lastName: "Family name / surname only (姓, 名字). Not phonetic.",
  firstName: "Given name only (名, 名前). Not phonetic.",
  fullName: "Full name in one field (氏名, お名前, 名前). Not phonetic.",
  lastNameKana: "Phonetic reading of the family name (セイ, フリガナ 姓, ふりがな せい).",
  firstNameKana: "Phonetic reading of the given name (メイ, フリガナ 名, ふりがな めい).",
  fullNameKana: "Phonetic reading of the full name in one field (フリガナ, ふりがな, カナ氏名).",
  email: "Email address, including confirmation fields (メールアドレス, 確認用).",
  tel: "Phone number or one part of a split phone number (電話番号, 携帯電話, 連絡先電話).",
  postalCode: "Postal / ZIP code or one part of a split postal code (郵便番号, 〒).",
  prefecture: "Prefecture / state (都道府県).",
  city: "City, ward, town or village (市区町村).",
  street: "Street address and block number (町名・番地, 丁目).",
  building: "Building name and room number (建物名, マンション名, 部屋番号).",
  address: "Whole address after the postal code in one field (住所, ご住所).",
  birthDate: "Date of birth or one part of it: year, month or day (生年月日, 誕生日).",
  gender: "Gender / sex (性別).",
  none: "None of the above: not personal profile information (message, company, coupon, password, agreement, etc.).",
};

const CRITERIA: ChoiceCriteria = { ...FIELD_KEY_CRITERIA };
const FIELD_KEY_SET: ReadonlySet<string> = new Set(FIELD_KEYS);

/** SDK の TypeSafeClient のうち、ここで使う部分だけ（テストで差し替えるため） */
export interface JevClient {
  systemOne(request: SystemOneRequest<Questions>): PromiseLike<SystemOneResult<Questions>>;
}

/**
 * Jev への判定リクエストを作る。
 * state には周りの欄との関係も判断材料になるよう全欄を入れ、質問は判定対象の欄だけ作る。
 * @param fields ページ内の全欄のメタ情報
 * @param targetIds Jev で判定する欄の ID（ルールで確定しなかった欄）
 * @param pageTitle ページタイトル（フォームの目的の手がかり）
 */
export function buildJevRequest(
  fields: readonly FieldDescriptor[],
  targetIds: readonly string[],
  pageTitle: string,
): SystemOneRequest<Questions> {
  const compacted = new Map(fields.map((f) => [f.id, compactField(f)]));
  const questions: Questions = {};
  for (const id of targetIds) {
    const field = compacted.get(id);
    if (!field) continue;
    // 対象欄のメタ情報を質問に埋め込み、ID の照合だけに頼らない（name と ID の取り違え対策）
    questions[id] = choice(
      {
        question: "Which personal profile item should be entered into this form field?",
        field,
        hint: "Judge mainly from this field's label, name, placeholder, autocomplete and nearby text. Use state.fields only as surrounding context. Choose none if it is not personal profile information.",
      },
      CRITERIA,
    );
  }
  return {
    model: JEV_MODEL,
    state: { pageTitle, fields: [...compacted.values()] },
    questions,
  };
}

/**
 * Jev の回答を Assignment に変換する。未知の選択肢や不正な値は捨てる。
 * @param result systemOne の結果
 * @param targetIds 質問した欄の ID
 */
export function parseJevResponse(result: SystemOneResult<Questions>, targetIds: readonly string[]): Assignment[] {
  const assignments: Assignment[] = [];
  for (const fieldId of targetIds) {
    const answer = result.answers[fieldId];
    if (!answer || answer.type !== "choice") continue;
    if (!FIELD_KEY_SET.has(answer.choice)) continue;
    if (!Number.isFinite(answer.confidence)) continue;
    assignments.push({ fieldId, key: answer.choice as FieldKey, confidence: answer.confidence, source: "jev" });
  }
  return assignments;
}

/**
 * ルールで確定しなかった欄を Jev で判定する。
 * API エラー（認証・レート制限・タイムアウト等）はそのまま throw し、フォールバックは呼び出し側で行う。
 * @returns 判定結果。targetIds が空なら API を呼ばずに空配列
 */
export async function classifyWithJev(
  client: JevClient,
  fields: readonly FieldDescriptor[],
  targetIds: readonly string[],
  pageTitle: string,
): Promise<Assignment[]> {
  if (targetIds.length === 0) return [];
  const result = await client.systemOne(buildJevRequest(fields, targetIds, pageTitle));
  return parseJevResponse(result, targetIds);
}

/** state 用に欄のメタ情報を縮める（空の項目を省き、選択肢はテキストだけにする） */
function compactField(field: FieldDescriptor): { [key: string]: JsonValue } {
  const out: { [key: string]: JsonValue } = {};
  const entries: [string, string | number | undefined][] = [
    ["id", field.id],
    ["tag", field.tag],
    ["type", field.type],
    ["name", field.name],
    ["htmlId", field.htmlId],
    ["autocomplete", field.autocomplete],
    ["label", field.label],
    ["placeholder", field.placeholder],
    ["ariaLabel", field.ariaLabel],
    ["nearbyText", field.nearbyText],
    ["maxLength", field.maxLength],
  ];
  for (const [key, value] of entries) {
    if (value !== undefined && value !== "") out[key] = value;
  }
  if (field.options?.length) {
    out["options"] = field.options.slice(0, MAX_OPTIONS_IN_STATE).map((o) => o.text);
  }
  return out;
}
