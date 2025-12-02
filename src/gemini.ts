import { runMain, buildContextPrefix, type ProviderConfig } from "./lib/runner.ts";
import type { Chunk } from "./lib/chunker.ts";

const config: ProviderConfig = {
  name: "geminippp",
  command: "gemini",
  buildArgs: (chunk: Chunk, commandArgs: string[]) => {
    const args = [...commandArgs];
    const lastArg = args[args.length - 1];

    if (lastArg && !lastArg.startsWith("-")) {
      args[args.length - 1] = buildContextPrefix(chunk) + lastArg;
    }

    return args;
  },
  helpText: `Usage: geminippp [gemini-options] "<prompt>"

geminippp accepts all gemini command options. Additional options:
  -c, --concurrency <n>  Number of parallel LLM calls (default: CPU cores)

Example:
  eslint . | geminippp "Fix these errors"
  eslint . | geminippp -c 4 "Fix these errors"`,
};

runMain(config).catch((error: unknown) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
