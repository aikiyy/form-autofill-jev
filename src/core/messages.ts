import type { FieldDescriptor, FillInstruction } from "./types.ts";

/** content script → background: 欄のメタ情報を送って入力指示を求める */
export interface ClassifyRequest {
  type: "classify";
  fields: FieldDescriptor[];
  pageTitle: string;
}

/** background → content script */
export interface ClassifyResponse {
  instructions: FillInstruction[];
  /** トーストに出す補足（フォールバックの理由など） */
  notice?: string;
}

export function isClassifyRequest(message: unknown): message is ClassifyRequest {
  if (typeof message !== "object" || message === null) return false;
  const m = message as Partial<ClassifyRequest>;
  return m.type === "classify" && Array.isArray(m.fields) && typeof m.pageTitle === "string";
}

/** 設定画面・ポップアップ → background: ロック状態が変わった（アイコンの動作を切り替える） */
export interface VaultStateChangedMessage {
  type: "vaultStateChanged";
}

/** 解除ポップアップ → background: 解除できたので、このタブで入力を続ける */
export interface FillAfterUnlockMessage {
  type: "fillAfterUnlock";
  tabId: number;
}

export function isVaultStateChangedMessage(message: unknown): message is VaultStateChangedMessage {
  return typeof message === "object" && message !== null && (message as { type?: unknown }).type === "vaultStateChanged";
}

export function isFillAfterUnlockMessage(message: unknown): message is FillAfterUnlockMessage {
  if (typeof message !== "object" || message === null) return false;
  const m = message as Partial<FillAfterUnlockMessage>;
  return m.type === "fillAfterUnlock" && typeof m.tabId === "number";
}
