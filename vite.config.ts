import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";
import manifest from "./src/manifest.ts";

export default defineConfig({
  plugins: [crx({ manifest }), tailwindcss()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    passWithNoTests: true,
  },
});
