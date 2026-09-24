import type { FieldDescriptor, FieldOption } from "../core/types.ts";

/** 要素に付与する拡張用 ID の属性名 */
export const FIELD_ID_ATTR = "data-afj-id";

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/** 入力対象にしない input の type */
const EXCLUDED_INPUT_TYPES = new Set([
  "hidden",
  "password",
  "file",
  "submit",
  "button",
  "reset",
  "image",
  "checkbox",
  "range",
  "color",
  "search",
]);

const CONTROL_SELECTOR = "input, select, textarea";
const NEARBY_TEXT_MAX = 30;
const PRECEDING_TEXT_MAX = 40;

/**
 * ページ内の入力欄を収集し、Jev・ルール判定に渡すメタ情報を作る。
 * 収集した要素には `data-afj-id` を付与し、後で入力する際の目印にする。
 * プロフィールの値は含まない（ページ側の値も読まない）。
 * @param root 走査対象のドキュメント
 * @returns 出現順に並んだ欄のメタ情報。radio は name ごとに1件
 */
export function scanFields(root: Document): FieldDescriptor[] {
  const fields: FieldDescriptor[] = [];
  const seenRadioGroups = new Set<string>();

  for (const el of root.querySelectorAll<FormControl>(CONTROL_SELECTOR)) {
    if (!isTarget(el)) continue;

    const index = fields.length;
    const id = `f${index}`;

    if (el instanceof HTMLInputElement && el.type === "radio") {
      const groupKey = `${el.form ? formKey(el.form) : ""}::${el.name}`;
      if (el.name && seenRadioGroups.has(groupKey)) continue;
      seenRadioGroups.add(groupKey);
      const radios = el.name ? radioGroup(root, el) : [el];
      for (const radio of radios) radio.setAttribute(FIELD_ID_ATTR, id);
      fields.push({
        ...baseDescriptor(el, id, index),
        label: resolveGroupLabel(el),
        options: radios.map((r) => ({ value: r.value, text: radioText(r) })),
      });
      continue;
    }

    el.setAttribute(FIELD_ID_ATTR, id);
    const descriptor: FieldDescriptor = { ...baseDescriptor(el, id, index), label: resolveLabel(el) };
    if (el instanceof HTMLSelectElement) descriptor.options = selectOptions(el);
    fields.push(descriptor);
  }

  return fields;
}

function baseDescriptor(el: FormControl, id: string, index: number): FieldDescriptor {
  const tag = el.tagName.toLowerCase() as FieldDescriptor["tag"];
  const descriptor: FieldDescriptor = {
    id,
    tag,
    type: el instanceof HTMLInputElement ? el.type : tag,
    name: el.name,
    htmlId: el.id,
    autocomplete: el.getAttribute("autocomplete") ?? "",
    label: "",
    placeholder: el.getAttribute("placeholder") ?? "",
    ariaLabel: el.getAttribute("aria-label") ?? "",
    nearbyText: followingText(el),
    index,
  };
  if (!(el instanceof HTMLSelectElement) && el.maxLength > 0) descriptor.maxLength = el.maxLength;
  return descriptor;
}

function isTarget(el: FormControl): boolean {
  if (el.disabled) return false;
  if (el instanceof HTMLInputElement && EXCLUDED_INPUT_TYPES.has(el.type)) return false;
  if (!(el instanceof HTMLSelectElement) && el.readOnly) return false;
  return isVisible(el);
}

function isVisible(el: Element): boolean {
  if (el.closest("[hidden]")) return false;
  const view = el.ownerDocument.defaultView;
  if (!view) return true;
  for (let node: Element | null = el; node; node = node.parentElement) {
    const style = view.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

/** ラベルの解決順: label[for] → 囲み label → aria-labelledby → th/dt → legend → 直前のテキスト */
function resolveLabel(el: FormControl): string {
  return (
    labelFor(el) ||
    wrappingLabel(el) ||
    ariaLabelledBy(el) ||
    tableHeader(el) ||
    definitionTerm(el) ||
    fieldsetLegend(el) ||
    precedingText(el)
  );
}

/** radio グループのラベル（各選択肢のラベルではなく、グループ全体の項目名） */
function resolveGroupLabel(el: HTMLInputElement): string {
  const anchor = el.closest("label") ?? el;
  return (
    ariaLabelledBy(el) ||
    fieldsetLegend(el) ||
    tableHeader(el) ||
    definitionTerm(el) ||
    precedingText(anchor)
  );
}

function labelFor(el: FormControl): string {
  const label = Array.from(el.labels ?? []).find((l) => l.htmlFor !== "");
  return label ? textWithoutControls(label) : "";
}

function wrappingLabel(el: FormControl): string {
  const label = el.closest("label");
  return label ? textWithoutControls(label) : "";
}

function ariaLabelledBy(el: Element): string {
  const ids = el.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];
  return normalize(ids.map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "").join(" "));
}

function tableHeader(el: Element): string {
  const row = el.closest("td")?.parentElement;
  const th = row?.querySelector(":scope > th");
  return th ? textWithoutControls(th) : "";
}

function definitionTerm(el: Element): string {
  const dd = el.closest("dd");
  let prev = dd?.previousElementSibling ?? null;
  while (prev && prev.tagName !== "DT") prev = prev.previousElementSibling;
  return prev ? textWithoutControls(prev) : "";
}

function fieldsetLegend(el: Element): string {
  const legend = el.closest("fieldset")?.querySelector(":scope > legend");
  return legend ? textWithoutControls(legend) : "";
}

/**
 * 直前にあるテキストを集める（入力欄は飛ばす）。
 * 見つからなければ親要素の直前へ1段だけさかのぼる。
 */
function precedingText(el: Element): string {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 2; depth++, node = node.parentElement) {
    const parts: string[] = [];
    for (let sib = node.previousSibling; sib; sib = sib.previousSibling) {
      if (isControlNode(sib)) continue;
      parts.unshift(nodeText(sib));
    }
    const text = normalize(parts.join(" "));
    if (text) return text.slice(-PRECEDING_TEXT_MAX);
  }
  return "";
}

/** 直後にあるテキスト（次の入力欄・次の欄の label まで） */
function followingText(el: Element): string {
  const anchor = el.closest("label") ?? el;
  const parts: string[] = [];
  for (let sib = anchor.nextSibling; sib; sib = sib.nextSibling) {
    if (isControlNode(sib) || (sib instanceof Element && sib.tagName === "LABEL")) break;
    parts.push(nodeText(sib));
  }
  return normalize(parts.join(" ")).slice(0, NEARBY_TEXT_MAX);
}

function isControlNode(node: Node): boolean {
  return node instanceof Element && (node.matches(CONTROL_SELECTOR) || node.querySelector(CONTROL_SELECTOR) !== null);
}

function nodeText(node: Node): string {
  return node instanceof Element ? textWithoutControls(node) : (node.textContent ?? "");
}

/** select の option などの文字列を含めずに要素のテキストを得る */
function textWithoutControls(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  for (const control of clone.querySelectorAll(CONTROL_SELECTOR)) control.remove();
  return normalize(clone.textContent ?? "");
}

function selectOptions(el: HTMLSelectElement): FieldOption[] {
  return Array.from(el.options, (o) => ({ value: o.value, text: normalize(o.text) }));
}

function radioGroup(root: Document, el: HTMLInputElement): HTMLInputElement[] {
  const scope: ParentNode = el.form ?? root;
  return Array.from(scope.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
    (r) => r.name === el.name && isTarget(r),
  );
}

function radioText(el: HTMLInputElement): string {
  return labelFor(el) || wrappingLabel(el) || el.getAttribute("aria-label") || followingText(el) || el.value;
}

function formKey(form: HTMLFormElement): string {
  return String(Array.from(form.ownerDocument.forms).indexOf(form));
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
