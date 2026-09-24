# タスク — form-autofill-jev

作成日: 2026-09-24

入力: design.md

## 進め方
- 上から順に1タスクずつ進める。各タスクは「テストを書く → 実装 → テストが通る → コミット」で完了とする
- 完了の証拠（テスト結果・ビルドログ・動作確認）を tasks.md に一言残す
- 詰まったら止めて design.md を見直す

## M0: 土台（先に技術リスクを潰す）
- [x] **T1 雛形**: Vite + CRXJS + TypeScript strict + Vitest(jsdom) + Tailwind v4 をセットアップする。manifest.ts・空の background・空の options を作る
  - 完了条件: `npm run build` が成功する／`npm test` が0件で通る／`dist/` を Chrome に読み込んでエラーが出ない
  - 証跡: build 成功（vite 8.3.0 / CRXJS 2.7.1 / TS 7.0.2）・`npm test` exit 0。Chrome 読み込みでエラーなし（ユーザー確認済み）
- [x] **T2 動的注入の検証**: アイコンクリック → `?script` で content script を注入 → `console.log` とバッジ表示
  - 完了条件: 実際の Chrome で任意のページに注入できる。chrome:// ページではバッジ「×」になる（設計リスク①の解消）
  - 証跡: ユーザーが実機で注入ログ・× バッジを確認。途中でエントリ名重複による SW 誤ロードを修正（53d027a）。`?script&iife` を採用（CRXJS が web_accessible_resources を付与する点は既知事項として許容）
- [x] **T3 型定義**: `core/types.ts`（ProfileKey / FieldKey / FieldDescriptor / Assignment / FillInstruction）
  - 完了条件: `tsc --noEmit` が通る
  - 証跡: `npm run typecheck` exit 0。FillInstruction は fill/review の判別共用体にし、radio/select の選択肢は FieldOption{value,text} で持つ

## M1: フォームの読み取り（DOM → descriptor）
- [ ] **T4 フィクスチャ作成**: `test/fixtures/forms/` に5種類の HTML を用意する
  - label[for] 型／テーブル（th）型／分割電話・分割郵便番号型／生年月日 select＋性別 radio 型／autocomplete 付きの英語フォーム
- [ ] **T5 scan**: `dom/scan.ts`（label の解決順、radio のまとめ、対象外要素の除外、data-afj-id の付与）
  - 完了条件: 5種類のフィクスチャで期待どおりの descriptor になることをユニットテストで確認

## M2: Jev の精度を早めに確認
- [ ] **T6 Jev リクエストの構築と解析**: `core/jev.ts`（buildJevRequest / parseJevResponse）。SDK の型を使い、ユニットテストはレスポンスのモックで行う
- [ ] **T7 spike**: `scripts/jev-spike.ts` で、フィクスチャの descriptor を実際の Jev に送る（`.env` の `TYPESAFE_API_KEY` を使用）
  - 完了条件: 欄ごとの choice と confidence の表を出力し、正解率と confidence の分布を tasks.md に記録する。結果をもとに閾値（初期値 0.85）と、ルールで拾うべき項目を決める
  - ※ユーザーに APIキーの用意を依頼する

## M3: 判定と整形（core）
- [ ] **T8 ルール判定**: `core/rules.ts`（autocomplete の対応表、日本語・英語の正規表現、あいまいな欄は null を返す）
- [ ] **T9 format**: `core/format.ts`（カナ⇔ひらがな、全角/半角、電話・郵便番号のハイフン、select/radio の選択肢照合）
- [ ] **T10 resolve**: `core/resolve.ts`（ルール結果と Jev 結果の統合、閾値による振り分け、連続する同じ key の分割、空のプロフィール項目はスキップ）
  - 完了条件: 分割電話・分割郵便番号・生年月日の select 3つ・ひらがな欄・選択肢が一致しないときの黄色扱いを、すべてユニットテストで確認

## M4: 保存とオプション画面
- [ ] **T11 repository**: `storage/repository.ts`（getProfile / saveProfile / getApiKey / saveApiKey。chrome.storage はモック）
- [ ] **T12 オプション画面**: プロフィール（要件の全項目）と APIキーの編集・保存（Tailwind）
  - 完了条件: Chrome 上で保存・再読み込みしても値が残る

## M5: 結合
- [ ] **T13 fill**: `dom/fill.ts`（native setter とイベント発火、select、radio、ハイライト）
  - 完了条件: React 風に setter を監視しているフィクスチャで、値が反映されることをテストで確認
- [ ] **T14 toast**: `dom/toast.ts`（Shadow DOM で「N欄入力・M欄要確認」と、フォールバックの理由を表示）
- [ ] **T15 結合**: background の classify 処理（rules → jev → resolve、APIキーなしや Jev エラー時のフォールバック）と、content の scan → message → fill → toast
  - 完了条件: フィクスチャを Chrome で開いて1クリックで入力される。APIキーを外してもルール判定分は入力される

## M6: 実際のフォームで検証
- [ ] **T16 実フォーム検証**: よく使う日本語フォーム5種以上で試し、欄ごとの正誤を記録する。閾値やルールを調整する
  - 完了条件: 要件の成功基準（正解率9割以上・誤入力0件）を満たす
- [ ] **T17 仕上げ**: CLAUDE.md のコマンド欄とディレクトリ欄を埋め、`.claude_workflow/complete.md` に完了記録を残す
