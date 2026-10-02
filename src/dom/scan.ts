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
/** 分割欄の区切りとして置かれるだけの文字（「-」「〜」等）。項目名としては扱わない */
const SEPARATOR_ONLY = /^[-－‐ー−~〜～/／・\s]*$/;
/** 「姓」「名」「セイ」「月」のような、まとまりの中の個別ラベルとみなす長さ */
const SUB_LABEL_MAX = 4;

/** 直前の欄の情報（項目名の引き継ぎに使う） */
interface PrevField {
  el: Element;
  label: string;
  /** 後続の欄と共有する項目名（タイトル・注記。個別ラベルを除いた部分） */
  context: string;
}

/** 欄自身から得たラベル。associated は label 要素から得たか（個別ラベルの判定に使う） */
interface OwnLabel {
  parts: string[];
  associated: boolean;
}
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
  let prev: PrevField | null = null;

  for (const el of root.querySelectorAll<FormControl>(CONTROL_SELECTOR)) {
    if (!isTarget(el)) continue;

    const index = fields.length;
    // ページ側の name/id（f1 等）と紛れると Jev が別の欄と取り違えるため、独自の接頭辞を付ける
    const id = `afj-${index}`;

    if (el instanceof HTMLInputElement && el.type === "radio") {
      const groupKey = `${el.form ? formKey(el.form) : ""}::${el.name}`;
      if (el.name && seenRadioGroups.has(groupKey)) continue;
      seenRadioGroups.add(groupKey);
      const radios = el.name ? radioGroup(root, el) : [el];
      for (const radio of radios) radio.setAttribute(FIELD_ID_ATTR, id);
      const label: string = resolveGroupLabel(el);
      fields.push({
        ...baseDescriptor(el, id, index),
        label,
        options: radios.map((r) => ({ value: r.value, text: radioText(r) })),
      });
      prev = { el, label, context: "" };
      continue;
    }

    el.setAttribute(FIELD_ID_ATTR, id);
    const resolved: Omit<PrevField, "el"> = withContext(resolveLabel(el), el, prev);
    // 項目名が見つからなければ直前のテキストを使う
    const label = resolved.label || precedingText(el);
    const descriptor: FieldDescriptor = { ...baseDescriptor(el, id, index), label };
    if (el instanceof HTMLSelectElement) descriptor.options = selectOptions(el);
    fields.push(descriptor);
    prev = { el, label, context: resolved.context };
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

/** ラベルの解決順: 関連付いた label（label[for]・囲み label）→ aria-labelledby → th/dt → legend（直前のテキストは引き継ぎの後に使う） */
function resolveLabel(el: FormControl): OwnLabel {
  const labels = associatedLabelParts(el);
  if (labels.length > 0) return { parts: labels, associated: true };
  const text = ariaLabelledBy(el) || tableHeader(el) || definitionTerm(el) || fieldsetLegend(el);
  return { parts: text ? [text] : [], associated: false };
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

/**
 * 欄に関連付いた label をすべて出現順につなげる。
 * 項目名のタイトル・注記・個別ラベル（「姓」等）が別々の label で同じ欄を指すフォームがあるため、先頭だけでは足りない。
 * 区切り文字だけの label（「-」）は除く。
 */
function associatedLabelParts(el: FormControl): string[] {
  const texts = Array.from(el.labels ?? [], textWithoutControls).filter((t) => !SEPARATOR_ONLY.test(t));
  return [...new Set(texts)];
}

function associatedLabels(el: FormControl): string {
  return associatedLabelParts(el).join(" ");
}

/**
 * 直前の欄との関係から、欄の項目名と後続の欄に引き継ぐ共通部分を決める。
 * - 項目名がない分割欄（電話番号の2・3欄目など）: 直前の欄の項目名をそのまま引き継ぐ
 * - 「名」「メイ」「月」のような短い個別ラベルだけの欄: 直前の欄と同じまとまりとみなし、共通の項目名（「保護者のお名前」等）を前に付ける
 * 引き継ぐのは近くにある直前の欄からだけ（別の行の欄から誤って引き継がないため）。
 * 「-」の label がある・個別ラベルがある場合は祖父母要素まで、それ以外は同じ親要素の中だけを近いとみなす。
 */
function withContext(own: OwnLabel, el: FormControl, prev: PrevField | null): Omit<PrevField, "el"> {
  const text = own.parts.join(" ");
  const grandparent = el.parentElement?.parentElement;

  if (text === "") {
    const scope = hasSeparatorLabel(el) ? grandparent : el.parentElement;
    if (prev && scope?.contains(prev.el)) return { label: prev.label, context: prev.context };
    return { label: "", context: "" };
  }

  const isSubLabel = own.associated && own.parts.length === 1 && text.length <= SUB_LABEL_MAX;
  if (isSubLabel && prev?.context && grandparent?.contains(prev.el)) {
    return { label: `${prev.context} ${text}`, context: prev.context };
  }

  return { label: text, context: own.parts.length > 1 ? own.parts.slice(0, -1).join(" ") : "" };
}

/** 「-」など区切り文字だけの label が付いているか */
function hasSeparatorLabel(el: FormControl): boolean {
  return Array.from(el.labels ?? []).some((l) => {
    const text = textWithoutControls(l);
    return text !== "" && SEPARATOR_ONLY.test(text);
  });
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
    if (!SEPARATOR_ONLY.test(text)) return text.slice(-PRECEDING_TEXT_MAX);
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
  return associatedLabels(el) || el.getAttribute("aria-label") || followingText(el) || el.value;
}

function formKey(form: HTMLFormElement): string {
  return String(Array.from(form.ownerDocument.forms).indexOf(form));
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
