import type { VaultState } from "../storage/repository.ts";

/** ロック中にアイコンを押したとき開く解除ポップアップ（ビルド後のパス） */
export const UNLOCK_POPUP = "src/popup/unlock.html";

/**
 * ロック状態に合わせてアイコンの動作を切り替える。
 * ロック中は解除ポップアップを開き、それ以外はポップアップなし（onClicked でそのまま入力）。
 * ポップアップを設定すると onClicked は発火しないため、状態が変わるたびに呼ぶ。
 */
export async function syncActionPopup(getState: () => Promise<VaultState>): Promise<void> {
  const state = await getState();
  await chrome.action.setPopup({ popup: state === "locked" ? UNLOCK_POPUP : "" });
}
