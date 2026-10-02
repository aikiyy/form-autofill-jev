import "../options/style.css";
import { unlock } from "../storage/repository.ts";
import { unlockAndFill } from "./unlock-flow.ts";

const form = document.querySelector<HTMLFormElement>("#unlock")!;
const input = form.elements.namedItem("passphrase") as HTMLInputElement;
const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
const message = document.querySelector<HTMLParagraphElement>("#message")!;

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void (async () => {
    button.disabled = true;
    message.textContent = "";
    // 鍵の導出（60万回）に少し時間がかかる
    button.textContent = "解除中…";
    const result = await unlockAndFill(input.value, {
      unlock,
      activeTabId: async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id,
      sendMessage: (m) => chrome.runtime.sendMessage(m),
    });
    if (result.ok) {
      window.close();
      return;
    }
    message.textContent = result.message;
    button.disabled = false;
    button.textContent = "解除して入力";
    input.select();
  })();
});

document.querySelector("#open-options")!.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage();
});
