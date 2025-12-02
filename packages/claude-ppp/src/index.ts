import { runMain, buildContextPrefix, type ProviderConfig, type Chunk } from "@llm-ppp/shared/runner";

const config: ProviderConfig = {
  name: "claude-ppp",
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
  helpText: `Usage: claude-ppp [claude-options] "<prompt>"

claude-ppp accepts all claude command options. Additional options:
  -c, --concurrency <n>  Number of parallel LLM calls (default: CPU cores)

Example:
  eslint . | claude-ppp "Fix these errors"
  eslint . | claude-ppp --dangerously-skip-permissions "Fix these errors"
  eslint . | claude-ppp -c 4 --model claude-sonnet-4-20250514 "Fix these errors"`,
};

runMain(config).catch((error: unknown) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
