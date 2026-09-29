/**
 * public/icons/icon.svg から拡張用の PNG アイコン（16/32/48/128px）を生成する。
 * 実行: npm run icons
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const SIZES = [16, 32, 48, 128] as const;
const dir = resolve(import.meta.dirname, "../public/icons");
const svg = readFileSync(resolve(dir, "icon.svg"));

for (const size of SIZES) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(resolve(dir, `icon-${size}.png`), png);
  console.log(`icon-${size}.png`);
}
