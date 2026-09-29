/**
 * Jev の日本語フォームでの判定精度を確かめる spike（T7）。
 * フィクスチャの全欄を（ルール判定を通さずに）Jev に送り、正解と比べて
 * 正解率と confidence の分布を出す。閾値とルールで拾うべき項目を決める材料にする。
 *
 * 実行: node --env-file=.env scripts/jev-spike.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { JSDOM } from "jsdom";
import { classifyWithJev } from "../src/core/jev.ts";
import type { FieldKey } from "../src/core/types.ts";
import { EXPECTED } from "../test/fixtures/expected.ts";

const THRESHOLDS = [0.5, 0.7, 0.85, 0.9, 0.95];

interface Row {
  fixture: string;
  name: string;
  label: string;
  expected: FieldKey;
  actual: FieldKey | "(no answer)";
  confidence: number;
}

/** scan.ts は DOM のグローバル（HTMLInputElement 等）を使うので jsdom の window を差し込む */
async function scanFixture(file: string) {
  const html = readFileSync(resolve(import.meta.dirname, "../test/fixtures/forms", file), "utf8");
  const dom = new JSDOM(html);
  const g = globalThis as Record<string, unknown>;
  for (const key of ["window", "document", "Node", "Element", "HTMLInputElement", "HTMLSelectElement", "HTMLTextAreaElement"]) {
    g[key] = key === "window" ? dom.window : (dom.window as unknown as Record<string, unknown>)[key];
  }
  const { scanFields } = await import("../src/dom/scan.ts");
  return { fields: scanFields(dom.window.document), title: dom.window.document.title };
}

async function main(): Promise<void> {
  const client = new TypeSafeClient();
  const rows: Row[] = [];
  let inputTokens = 0;
  let elapsedMs = 0;

  for (const [fixture, expected] of Object.entries(EXPECTED)) {
    const { fields, title } = await scanFixture(fixture);
    const targetIds = fields.map((f) => f.id);
    const started = performance.now();
    const assignments = await classifyWithJev(
      {
        systemOne: async (req) => {
          const res = await client.systemOne(req);
          inputTokens += res.usage.input_tokens;
          return res;
        },
      },
      fields,
      targetIds,
      title,
    );
    const ms = performance.now() - started;
    elapsedMs += ms;
    console.log(`${fixture}: ${fields.length}欄 / ${Math.round(ms)}ms`);

    for (const f of fields) {
      const want = expected[f.name];
      if (!want) throw new Error(`${fixture} の ${f.name} に正解が定義されていない`);
      const got = assignments.find((a) => a.fieldId === f.id);
      rows.push({
        fixture,
        name: f.name,
        label: f.label,
        expected: want,
        actual: got?.key ?? "(no answer)",
        confidence: got?.confidence ?? 0,
      });
    }
  }

  console.log("\n## 欄ごとの結果");
  console.table(
    rows.map((r) => ({
      fixture: r.fixture.replace(".html", ""),
      name: r.name,
      label: r.label,
      expected: r.expected,
      actual: r.actual,
      conf: r.confidence.toFixed(2),
      ok: r.expected === r.actual ? "✓" : "✗",
    })),
  );

  const correct = rows.filter((r) => r.expected === r.actual).length;
  console.log(`\n## 全体: 正解 ${correct}/${rows.length}（${pct(correct, rows.length)}）`);
  console.log(`入力トークン合計: ${inputTokens} / 平均レイテンシ: ${Math.round(elapsedMs / Object.keys(EXPECTED).length)}ms`);

  console.log("\n## 閾値ごと（confidence ≥ 閾値 の欄だけ自動入力した場合）");
  console.table(
    THRESHOLDS.map((t) => {
      const auto = rows.filter((r) => r.confidence >= t && r.actual !== "none");
      const wrong = auto.filter((r) => r.expected !== r.actual);
      return {
        threshold: t,
        自動入力: `${auto.length}/${rows.length}`,
        誤入力: wrong.length,
        誤入力の欄: wrong.map((r) => `${r.name}(${r.expected}→${r.actual})`).join(", "),
      };
    }),
  );
}

function pct(n: number, d: number): string {
  return `${((n / d) * 100).toFixed(1)}%`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
