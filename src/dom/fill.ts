import type { FillInstruction } from "../core/types.ts";
import { FIELD_ID_ATTR } from "./scan.ts";

/** ハイライトの outline。ページの CSS に干渉しないよう要素の style に直接指定する */
export const HIGHLIGHT = {
  filled: "2px solid rgb(34, 197, 94)",
  review: "2px solid rgb(234, 179, 8)",
} as const;

export interface FillSummary {
  /** 値を入れた欄の数 */
  filled: number;
  /** 要確認にした欄の数（入力できなかった欄を含む） */
  review: number;
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;

/**
 * 入力指示をページに反映する。
 * React / Vue などが値の変更を検知できるよう、ネイティブの setter で値を入れてから input・change を発火する。
 * @param root 対象のドキュメント（scanFields で data-afj-id を付与済み）
 * @param instructions resolveFills の結果
 * @returns 実際に入力できた欄・要確認の欄の数
 */
export function applyFills(root: Document, instructions: readonly FillInstruction[]): FillSummary {
  const summary: FillSummary = { filled: 0, review: 0 };
  for (const instr of instructions) {
    const elements = Array.from(root.querySelectorAll<HTMLElement>(`[${FIELD_ID_ATTR}="${instr.fieldId}"]`));
    if (elements.length === 0) continue;
    const ok = instr.status === "fill" && fillElements(elements, instr.value);
    for (const el of elements) highlight(el, ok ? "filled" : "review");
    summary[ok ? "filled" : "review"]++;
  }
  return summary;
}

function fillElements(elements: HTMLElement[], value: string): boolean {
  const first = elements[0];
  if (first instanceof HTMLInputElement && first.type === "radio") {
    return selectRadio(elements.filter((e): e is HTMLInputElement => e instanceof HTMLInputElement), value);
  }
  if (first instanceof HTMLSelectElement) return selectOption(first, value);
  if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) return setText(first, value);
  return false;
}

function setText(el: TextControl, value: string): boolean {
  el.focus();
  nativeValueSetter(el).call(el, value);
  dispatch(el, "input");
  dispatch(el, "change");
  el.blur();
  return el.value === value;
}

function selectOption(el: HTMLSelectElement, value: string): boolean {
  if (!Array.from(el.options).some((o) => o.value === value)) return false;
  nativeValueSetter(el).call(el, value);
  dispatch(el, "input");
  dispatch(el, "change");
  return el.value === value;
}

function selectRadio(radios: HTMLInputElement[], value: string): boolean {
  const target = radios.find((r) => r.value === value);
  if (!target) return false;
  // click は checked の更新と input・change の発火をまとめて行い、フレームワークの onChange も呼ばれる
  target.click();
  return target.checked;
}

/** 要素インスタンス側の value 定義（React の値の記録）を避け、プロトタイプの setter を使う */
function nativeValueSetter(el: TextControl | HTMLSelectElement): (this: Element, value: string) => void {
  const proto = Object.getPrototypeOf(el) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) throw new Error("value setter not found");
  return setter;
}

function dispatch(el: Element, type: "input" | "change"): void {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}

function highlight(el: HTMLElement, kind: keyof typeof HIGHLIGHT): void {
  el.style.outline = HIGHLIGHT[kind];
  el.style.outlineOffset = "1px";
}
