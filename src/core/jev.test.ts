import type { ChoiceQuestion, SystemOneResult, Questions } from "@typesafe-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { buildJevRequest, classifyWithJev, parseJevResponse, type JevClient } from "./jev.ts";
import { FIELD_KEYS, type FieldDescriptor } from "./types.ts";

function field(overrides: Partial<FieldDescriptor> & Pick<FieldDescriptor, "id" | "index">): FieldDescriptor {
  return {
    tag: "input",
    type: "text",
    name: "",
    htmlId: "",
    autocomplete: "",
    label: "",
    placeholder: "",
    ariaLabel: "",
    nearbyText: "",
    ...overrides,
  };
}

const fields: FieldDescriptor[] = [
  field({ id: "f0", index: 0, name: "sei", label: "姓" }),
  field({ id: "f1", index: 1, name: "q1", label: "ご連絡先", placeholder: "090-1234-5678", maxLength: 13 }),
  field({
    id: "f2",
    index: 2,
    tag: "select",
    type: "select",
    name: "pref",
    label: "都道府県",
    options: [
      { value: "", text: "選択してください" },
      { value: "13", text: "東京都" },
    ],
  }),
];

function result(answers: Record<string, unknown>): SystemOneResult<Questions> {
  return { model: "jev-1.13.0", answers, usage: { input_tokens: 1, output_tokens: 1 } } as SystemOneResult<Questions>;
}

describe("buildJevRequest", () => {
  it("判定対象の欄だけ Choice 質問を作り、選択肢は全 FieldKey にする", () => {
    const req = buildJevRequest(fields, ["f1", "f2"], "会員登録");

    expect(Object.keys(req.questions)).toEqual(["f1", "f2"]);
    const q = req.questions["f1"] as ChoiceQuestion;
    expect(q.type).toBe("choice");
    expect(Object.keys(q.criteria)).toEqual([...FIELD_KEYS]);
    expect(JSON.stringify(q.instructions)).toContain("f1");
    expect(req.model).toBe("jev-latest");
  });

  it("各質問に対象欄自身のメタ情報を埋め込み、ID の照合だけに頼らない", () => {
    // ページ側の name が拡張の ID と紛らわしくても、質問だけで対象欄が特定できるようにする
    const req = buildJevRequest(fields, ["f1"], "会員登録");
    const q = req.questions["f1"] as ChoiceQuestion;

    expect(q.instructions).toMatchObject({
      field: { id: "f1", name: "q1", label: "ご連絡先", placeholder: "090-1234-5678" },
    });
  });

  it("state には周りの欄も判断材料として全欄を入れ、空の項目は省く", () => {
    const req = buildJevRequest(fields, ["f1"], "会員登録");
    const state = req.state as { pageTitle: string; fields: Record<string, unknown>[] };

    expect(state.pageTitle).toBe("会員登録");
    expect(state.fields.map((f) => f["id"])).toEqual(["f0", "f1", "f2"]);
    expect(state.fields[1]).toEqual({
      id: "f1",
      tag: "input",
      type: "text",
      name: "q1",
      label: "ご連絡先",
      placeholder: "090-1234-5678",
      maxLength: 13,
    });
    expect(state.fields[2]?.["options"]).toEqual(["選択してください", "東京都"]);
  });
});

describe("parseJevResponse", () => {
  it("回答を source: jev の Assignment に変換する", () => {
    const res = result({
      f1: { type: "choice", choice: "tel", confidence: 0.91, probabilities: {} },
      f2: { type: "choice", choice: "prefecture", confidence: 0.97, probabilities: {} },
    });

    expect(parseJevResponse(res, ["f1", "f2"])).toEqual([
      { fieldId: "f1", key: "tel", confidence: 0.91, source: "jev" },
      { fieldId: "f2", key: "prefecture", confidence: 0.97, source: "jev" },
    ]);
  });

  it("回答がない欄・未知の選択肢・不正な confidence は捨てる", () => {
    const res = result({
      f1: { type: "choice", choice: "unknownKey", confidence: 0.9, probabilities: {} },
      f2: { type: "choice", choice: "prefecture", confidence: Number.NaN, probabilities: {} },
    });

    expect(parseJevResponse(res, ["f0", "f1", "f2"])).toEqual([]);
  });
});

describe("classifyWithJev", () => {
  it("判定対象がなければ API を呼ばずに空配列を返す", async () => {
    const client: JevClient = { systemOne: vi.fn() };

    await expect(classifyWithJev(client, fields, [], "t")).resolves.toEqual([]);
    expect(client.systemOne).not.toHaveBeenCalled();
  });

  it("リクエストを送り、回答を Assignment にして返す", async () => {
    const systemOne = vi.fn().mockResolvedValue(
      result({ f1: { type: "choice", choice: "tel", confidence: 0.88, probabilities: {} } }),
    );

    await expect(classifyWithJev({ systemOne }, fields, ["f1"], "t")).resolves.toEqual([
      { fieldId: "f1", key: "tel", confidence: 0.88, source: "jev" },
    ]);
    expect(systemOne).toHaveBeenCalledWith(buildJevRequest(fields, ["f1"], "t"));
  });

  it("API エラーは呼び出し元に伝える（フォールバックは background で行う）", async () => {
    const systemOne = vi.fn().mockRejectedValue(new Error("429"));

    await expect(classifyWithJev({ systemOne }, fields, ["f1"], "t")).rejects.toThrow("429");
  });
});
