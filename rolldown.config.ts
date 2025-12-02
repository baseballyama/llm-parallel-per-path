import { defineConfig } from "rolldown";

export default defineConfig({
  input: {
    "claude-ppp": "src/claude.ts",
    "gemini-ppp": "src/gemini.ts",
    "codex-ppp": "src/codex.ts",
  },
  output: {
    dir: "dist",
    format: "esm",
    banner: "#!/usr/bin/env node",
  },
  platform: "node",
  resolve: {
    extensions: [".ts", ".js"],
  },
});
