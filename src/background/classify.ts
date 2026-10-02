import { APIConnectionError, APIError, APITimeoutError } from "@typesafe-ai/sdk";
import { classifyWithJev, type JevClient } from "../core/jev.ts";
import type { ClassifyResponse } from "../core/messages.ts";
import { resolveFills } from "../core/resolve.ts";
import { classifyByRules } from "../core/rules.ts";
import type { Assignment, FieldDescriptor, Profile } from "../core/types.ts";
import { LockedError } from "../storage/repository.ts";

/** 外部とのやり取り（テストで差し替える） */
export interface ClassifyDeps {
  getProfile(): Promise<Profile>;
  getApiKey(): Promise<string>;
  createClient(apiKey: string): JevClient;
}

const RULES_ONLY = "項目名から確実に判断できる欄だけ入力しました";

/**
 * ページの欄を判定して入力指示を作る。ルール → Jev（残りの欄のみ）→ resolve の順。
 * APIキー未設定・Jev のエラー時はルール判定分だけで入力指示を作り、理由を notice に入れる。
 * 暗号化オンでロック中なら入力せず、解除を促す notice を返す。
 * @throws プロフィール・APIキーの読み出し（chrome.storage）に失敗した場合
 */
export async function classifyPage(
  fields: readonly FieldDescriptor[],
  pageTitle: string,
  deps: ClassifyDeps,
): Promise<ClassifyResponse> {
  let profile: Profile;
  try {
    profile = await deps.getProfile();
  } catch (error) {
    if (error instanceof LockedError) {
      return { instructions: [], notice: "ロック中です。拡張のアイコンを押してロックを解除してください" };
    }
    throw error;
  }
  if (Object.values(profile).every((v) => v === "")) {
    return { instructions: [], notice: "プロフィールが未設定です。拡張のオプション画面から設定してください" };
  }

  const ruleAssignments = fields.map(classifyByRules).filter((a): a is Assignment => a !== null);
  const decided = new Set(ruleAssignments.map((a) => a.fieldId));
  const remaining = fields.filter((f) => !decided.has(f.id)).map((f) => f.id);

  let jevAssignments: Assignment[] = [];
  let notice: string | undefined;
  if (remaining.length > 0) {
    const apiKey = await deps.getApiKey();
    if (!apiKey) {
      notice = `APIキー未設定のため、${RULES_ONLY}`;
    } else {
      try {
        jevAssignments = await classifyWithJev(deps.createClient(apiKey), fields, remaining, pageTitle);
      } catch (error) {
        console.warn("[form-autofill] Jev の判定に失敗しました", error);
        notice = `${describeJevError(error)}。${RULES_ONLY}`;
      }
    }
  }

  const instructions = resolveFills(fields, [...ruleAssignments, ...jevAssignments], profile);
  return notice ? { instructions, notice } : { instructions };
}

/** Jev のエラーをトースト向けの短い説明にする */
export function describeJevError(error: unknown): string {
  if (error instanceof APITimeoutError) return "Jev の応答がタイムアウトしました";
  if (error instanceof APIConnectionError) return "Jev に接続できません";
  if (error instanceof APIError) {
    if (error.status === 401 || error.status === 403) return "Jev の APIキーが無効です";
    if (error.status === 429) return "Jev の利用上限に達しました";
    if (error.status === 529 || error.status >= 500) return "Jev が混雑しています";
  }
  return "Jev で判定できませんでした";
}
