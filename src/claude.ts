import { runMain, buildContextPrefix, type ProviderConfig } from "./lib/runner.ts";
import type { Chunk } from "./lib/chunker.ts";

const config: ProviderConfig = {
  name: "claudeppp",
  command: "claude",
  buildArgs: (chunk: Chunk, commandArgs: string[]) => {
    const args = [...commandArgs];
    const lastArg = args[args.length - 1];

    if (lastArg && !lastArg.startsWith("-")) {
      args[args.length - 1] = buildContextPrefix(chunk) + lastArg;
    }

    if (!args.includes("--print") && !args.includes("-p")) {
      args.unshift("--print");
    }

    return args;
  },
  helpText: `Usage: claudeppp [claude-options] "<prompt>"

claudeppp accepts all claude command options. Additional options:
  -c, --concurrency <n>  Number of parallel LLM calls (default: CPU cores)

Example:
  eslint . | claudeppp "Fix these errors"
  eslint . | claudeppp --dangerously-skip-permissions "Fix these errors"
  eslint . | claudeppp -c 4 --model claude-sonnet-4-20250514 "Fix these errors"`,
};

runMain(config).catch((error: unknown) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
