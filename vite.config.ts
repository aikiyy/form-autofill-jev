import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import manifest from "./src/manifest.ts";

export default defineConfig({
  plugins: [crx({ manifest }), tailwindcss()],
  build: {
    rollupOptions: {
      // ロック中だけ chrome.action.setPopup で使うため manifest には書かず、ここでビルド対象に加える
      input: { unlock: "src/popup/unlock.html" },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    passWithNoTests: true,
  },
});
