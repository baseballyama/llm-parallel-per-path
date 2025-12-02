import { runMain, buildContextPrefix, type ProviderConfig } from "./lib/runner.ts";
import type { Chunk } from "./lib/chunker.ts";

const config: ProviderConfig = {
  name: "codexppp",
  command: "codex",
  buildArgs: (chunk: Chunk, commandArgs: string[]) => {
    const args = [...commandArgs];
    const lastArg = args[args.length - 1];

    if (lastArg && !lastArg.startsWith("-")) {
      args[args.length - 1] = buildContextPrefix(chunk) + lastArg;
    }

    return args;
  },
  helpText: `Usage: codexppp [codex-options] "<prompt>"

codexppp accepts all codex command options. Additional options:
  -c, --concurrency <n>  Number of parallel LLM calls (default: CPU cores)

Example:
  eslint . | codexppp "Fix these errors"
  eslint . | codexppp -c 4 "Fix these errors"`,
};

runMain(config).catch((error: unknown) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
