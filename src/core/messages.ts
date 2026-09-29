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
