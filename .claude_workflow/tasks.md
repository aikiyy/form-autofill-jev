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
- [x] **T4 フィクスチャ作成**: `test/fixtures/forms/` に5種類の HTML を用意する
  - label[for] 型／テーブル（th）型／分割電話・分割郵便番号型／生年月日 select＋性別 radio 型／autocomplete 付きの英語フォーム
  - 証跡: test/fixtures/forms/ に5ファイル作成（除外対象の password・hidden・非表示・disabled・checkbox も含む）
- [x] **T5 scan**: `dom/scan.ts`（label の解決順、radio のまとめ、対象外要素の除外、data-afj-id の付与）
  - 完了条件: 5種類のフィクスチャで期待どおりの descriptor になることをユニットテストで確認
  - 証跡: scan.test.ts 13件 pass・typecheck OK。jsdom に CSS.escape がないため、label は `el.labels`、radio は name 比較で解決（実ブラウザでも同じ挙動）

## M2: Jev の精度を早めに確認
- [x] **T6 Jev リクエストの構築と解析**: `core/jev.ts`（buildJevRequest / parseJevResponse）。SDK の型を使い、ユニットテストはレスポンスのモックで行う
  - 証跡: jev.test.ts 7件 pass・typecheck OK。選択肢の説明は英語主＋日本語表記例。API エラーは throw してフォールバックは T15 で扱う
- [x] **T7 spike**: `scripts/jev-spike.ts` で、フィクスチャの descriptor を実際の Jev に送る（`.env` の `TYPESAFE_API_KEY` を使用）
  - 完了条件: 欄ごとの choice と confidence の表を出力し、正解率と confidence の分布を tasks.md に記録する。結果をもとに閾値（初期値 0.85）と、ルールで拾うべき項目を決める
  - ※ユーザーに APIキーの用意を依頼する
  - 証跡（2026-09-29, jev-1.13.0, 5フィクスチャ36欄）:
    - 初回 31/36（86.1%）。誤りはテーブル型の4欄がすべて1行ずれ → 拡張の ID（f0…）がページの name（f1…）と衝突し、Jev が name で照合していたのが原因。ID を `afj-N` に変更し、質問に対象欄のメタ情報を埋め込んで修正
    - 修正後 **36/36（100%）**。閾値 0.5〜0.95 のどれでも誤入力 0。平均レイテンシ約 210ms／フォーム、入力トークン約 5,800／フォーム
    - 0.95 未満: pref 0.94・address-line1 0.92・address-line2 0.68（building）
  - 決定: 閾値は **0.85** のまま（0.85〜0.9 で自動入力 34/35・誤入力 0）。autocomplete 付きの欄は Jev より確実なので T8 のルールで先に確定させる（address-line2 対策）

## M3: 判定と整形（core）
- [x] **T8 ルール判定**: `core/rules.ts`（autocomplete の対応表、日本語・英語の正規表現、あいまいな欄は null を返す）
  - 証跡: rules.test.ts 77件 pass（全体 101件）・typecheck OK。フィクスチャ全欄で「null か正解のどちらか」を検証するテストを追加（正解表は test/fixtures/expected.ts に共通化）。「建物名」の「名」を名と誤認して null になる問題を、単独の「名」だけ拾う正規表現で修正
- [x] **T9 format**: `core/format.ts`（カナ⇔ひらがな、全角/半角、電話・郵便番号のハイフン、select/radio の選択肢照合）
  - 証跡: format.test.ts 27件 pass・typecheck OK。設計変更: 電話番号は市外局番の桁数が地域で違い推測すると誤入力になるため、プロフィールに**ハイフン区切りで保存**し、その区切り位置で分割する（区切りなしの固定電話は分割せず要確認）。半角カナ指定は非対応で null（要確認）
- [x] **T10 resolve**: `core/resolve.ts`（ルール結果と Jev 結果の統合、閾値による振り分け、連続する同じ key の分割、空のプロフィール項目はスキップ）
  - 完了条件: 分割電話・分割郵便番号・生年月日の select 3つ・ひらがな欄・選択肢が一致しないときの黄色扱いを、すべてユニットテストで確認
  - 証跡: resolve.test.ts 29件 pass（全体 157件）・typecheck OK。フィクスチャ3種で scan → ルール → resolve の結合テストも追加し、分割欄・select・radio に正しい値が入ることを確認。分割しない項目が隣り合って重複した場合・分割欄の一部だけ低確信の場合は、グループ全体を要確認にする

## M4: 保存とオプション画面
- [x] **T11 repository**: `storage/repository.ts`（getProfile / saveProfile / getApiKey / saveApiKey。chrome.storage はモック）
  - 証跡: repository.test.ts 7件 pass・typecheck OK（※テストと実装を同時に作成したため Red の確認は省略）。欠けた項目・不正な型は空で補う。読み書きは readItem / writeItem に集約（暗号化の差し込み口）
- [x] **T12 オプション画面**: プロフィール（要件の全項目）と APIキーの編集・保存（Tailwind）
  - 完了条件: Chrome 上で保存・再読み込みしても値が残る
  - 証跡: form.test.ts 11件 pass（正規化・検証）。ユーザーが実機で保存・再読み込み後の保持・固定電話ハイフンなしのエラー表示を確認（c03acb4）

## M5: 結合
- [x] **T13 fill**: `dom/fill.ts`（native setter とイベント発火、select、radio、ハイライト）
  - 完了条件: React 風に setter を監視しているフィクスチャで、値が反映されることをテストで確認
  - 証跡: fill.test.ts 8件 pass・typecheck OK。要素インスタンス側の value setter（React の値の記録）が呼ばれないことをテストで確認。select に該当 value がない・入力後に値が一致しない欄は要確認として数える
- [x] **T14 toast**: `dom/toast.ts`（Shadow DOM で「N欄入力・M欄要確認」と、フォールバックの理由を表示）
  - 証跡: toast.test.ts 6件 pass・typecheck OK。Shadow DOM 内で表示し、連続表示は置き換え・6秒で自動で消える
- [x] **T15 結合**: background の classify 処理（rules → jev → resolve、APIキーなしや Jev エラー時のフォールバック）と、content の scan → message → fill → toast
  - 完了条件: フィクスチャを Chrome で開いて1クリックで入力される。APIキーを外してもルール判定分は入力される
  - 証跡: classify.test.ts 13件 pass（全体 200件）・build OK。ユーザーが実機でフィクスチャ5種すべて正しく入力されること、APIキーなしでルール判定分のみ入力＋理由表示されることを確認（08e9d43）

## M6: 実際のフォームで検証
- [ ] **T16 実フォーム検証**: よく使う日本語フォーム5種以上で試し、欄ごとの正誤を記録する。閾値やルールを調整する
  - 完了条件: 要件の成功基準（正解率9割以上・誤入力0件）を満たす
  - 実フォーム1: イベント申込フォームで問題4件 → 修正
    - 「姓」に氏名が入る: 1つの欄に label[for] が複数（タイトル「申込者のお名前」・注記「全角」・個別「姓」）あり、先頭しか見ていなかった → 全 label を出現順に結合
    - 電話番号・郵便番号が入らない: 2・3欄目の label が「-」だけで項目名がなかった → 区切りだけの label を除き、近くの直前の欄の項目名を引き継ぐ
    - 年齢: FieldKey に age を追加（生年月日と当日の日付から満年齢を計算）
    - 追加で発見: 保護者・受信契約者など**本人以外の欄に本人の情報が入る**（誤入力）→ ユーザー判断で「入力しない」。ルールで none に確定し、Jev の none の説明にも追加。「名」だけの個別ラベル欄が「保護者のお名前」の文脈を失う問題も、直前の欄から共通の項目名を引き継いで修正
    - 証跡: 同じ構造のフィクスチャ multi-label.html を追加。全 222 テスト pass。spike（Jev 単独）でも 6フィクスチャ 60/60（100%）・誤入力 0
- [ ] **T17 仕上げ**: CLAUDE.md のコマンド欄とディレクトリ欄を埋め、`.claude_workflow/complete.md` に完了記録を残す

## M7: 追加要望
- [x] **T18 パスポート項目**（旅券番号・有効期限・ローマ字氏名）: 型・保存 → ルール → Jev → 整形/統合 → 設定画面 → フィクスチャ
  - 誤入力対策: 「有効期限」は旅券の文脈があるときだけルールで確定（クレカと区別）／ローマ字1欄氏名は順序の手がかりがなければ要確認／ローマ字の手がかりがなければ漢字氏名として扱う
  - 完了条件: 全テスト pass、spike で新フィクスチャ誤入力 0、Chrome で設定保存と入力をユーザー確認
  - 進捗（2026-10-03）: 実装完了。全 255 テスト pass・build OK。spike（Jev 単独）7フィクスチャ 69/69・誤入力 0（発行日 none 0.64・カード有効期限 none 0.83〜0.85 と確信度は低めだが、誤って選んでも閾値未満なら黄になる設計）。日付処理を birthDate 専用から日付項目全般（resolveDateParts）に一般化。残りは Chrome でのユーザー確認
  - 証跡: Chrome 確認で有効期限が黄になった → フィクスチャの年月日 select に検証用の日付の選択肢しかなかったのが原因（拡張は「選択肢に該当なし」で安全側に倒していた）。全範囲の選択肢に直し、任意の日付で入るテストを追加（da9e464）。ユーザーが実機で全項目の入力を確認
- [ ] **T19 暗号化**（任意でオン/オフ・解除はブラウザ終了まで・ロック中はポップアップで解除してそのまま入力）
  - 方式: PBKDF2-SHA256 60万回 → AES-GCM 256bit。プロフィールと APIキーをまとめて1つの暗号文（`vault`）にし、解除中の鍵は chrome.storage.session に置く
  - [x] T19a crypto.ts（往復・パスフレーズ違い・毎回 IV/salt が変わる）
  - [ ] T19b repository の vault 対応（状態遷移・平文の削除・解除中の保存が暗号文のまま・LockedError・オフで平文に戻る）
  - [ ] T19c background（ポップアップ切り替え・LockedError のトースト）
  - [ ] T19d 設定画面（有効化・解除・変更・無効化・リセット）
  - [ ] T19e 解除ポップアップ＋そのまま入力。Chrome でユーザー確認
