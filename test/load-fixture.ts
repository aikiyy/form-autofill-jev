import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** test/fixtures/forms の HTML を現在の jsdom document に読み込む */
export function loadFixture(name: string): void {
  const html = readFileSync(resolve(import.meta.dirname, "fixtures/forms", name), "utf8");
  const doc = new DOMParser().parseFromString(html, "text/html");
  document.title = doc.title;
  document.body.innerHTML = doc.body.innerHTML;
}
