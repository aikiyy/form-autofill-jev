import { APIConnectionError, APIError, APITimeoutError, type Questions, type SystemOneResult } from "@typesafe-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { JevClient } from "../core/jev.ts";
import type { FieldDescriptor, Profile } from "../core/types.ts";
import { EMPTY_PROFILE } from "../storage/repository.ts";
import { classifyPage, describeJevError, type ClassifyDeps } from "./classify.ts";

const profile: Profile = { ...EMPTY_PROFILE, lastName: "山田", email: "yamada@example.com", city: "渋谷区" };

function field(id: string, index: number, overrides: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    id,
    index,
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

// afj-0 はルールで確定（姓）、afj-1 は手がかりが弱く Jev に回る
const fields = [field("afj-0", 0, { label: "姓" }), field("afj-1", 1, { label: "ご連絡先" })];

function jevResult(answers: Record<string, unknown>): SystemOneResult<Questions> {
  return { model: "jev-1.13.0", answers, usage: { input_tokens: 1, output_tokens: 0 } } as SystemOneResult<Questions>;
}

function deps(overrides: Partial<ClassifyDeps> = {}, systemOne?: JevClient["systemOne"]): ClassifyDeps {
  return {
    getProfile: async () => profile,
    getApiKey: async () => "sk-test",
    createClient: () => ({
      systemOne:
        systemOne ??
        vi.fn().mockResolvedValue(jevResult({ "afj-1": { type: "choice", choice: "email", confidence: 0.95, probabilities: {} } })),
    }),
    ...overrides,
  };
}

describe("classifyPage", () => {
  it("ルールで確定しなかった欄だけ Jev に聞き、両方の結果から入力指示を作る", async () => {
    const systemOne = vi
      .fn()
      .mockResolvedValue(jevResult({ "afj-1": { type: "choice", choice: "email", confidence: 0.95, probabilities: {} } }));

    const result = await classifyPage(fields, "会員登録", deps({}, systemOne));

    expect(Object.keys(systemOne.mock.calls[0]![0].questions)).toEqual(["afj-1"]);
    expect(result).toEqual({
      instructions: [
        { fieldId: "afj-0", status: "fill", value: "山田" },
        { fieldId: "afj-1", status: "fill", value: "yamada@example.com" },
      ],
    });
  });

  it("全欄がルールで確定したら Jev を呼ばない", async () => {
    const systemOne = vi.fn();
    await classifyPage([fields[0]!], "t", deps({}, systemOne));
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("APIキー未設定ならルール判定分だけ入力し、その旨を補足する", async () => {
    const createClient = vi.fn();
    const result = await classifyPage(fields, "t", deps({ getApiKey: async () => "", createClient }));

    expect(createClient).not.toHaveBeenCalled();
    expect(result.instructions).toEqual([{ fieldId: "afj-0", status: "fill", value: "山田" }]);
    expect(result.notice).toContain("APIキー");
  });

  it("Jev がエラーでもルール判定分は入力し、理由を補足する", async () => {
    const systemOne = vi.fn().mockRejectedValue(new APITimeoutError(2500));
    const result = await classifyPage(fields, "t", deps({}, systemOne));

    expect(result.instructions).toEqual([{ fieldId: "afj-0", status: "fill", value: "山田" }]);
    expect(result.notice).toContain("タイムアウト");
  });

  it("プロフィールが未設定なら設定を促す", async () => {
    const result = await classifyPage(fields, "t", deps({ getProfile: async () => ({ ...EMPTY_PROFILE }) }));
    expect(result.instructions).toEqual([]);
    expect(result.notice).toContain("プロフィール");
  });
});

describe("describeJevError", () => {
  it.each<[unknown, string]>([
    [new APIError(401, {}, new Headers()), "APIキーが無効"],
    [new APIError(429, {}, new Headers()), "利用上限"],
    [new APIError(529, {}, new Headers()), "混雑"],
    [new APITimeoutError(2500), "タイムアウト"],
    [new APIConnectionError("offline"), "接続できません"],
    [new Error("unknown"), "Jev"],
  ])("%o → 「%s」を含む", (error, expected) => {
    expect(describeJevError(error)).toContain(expected);
  });
});
