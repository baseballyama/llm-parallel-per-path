import {
  runMain,
  buildContextPrefix,
  type ProviderConfig,
  type Chunk,
} from "@llm-ppp/shared/runner";

const config: ProviderConfig = {
  name: "codex-ppp",
  command: "codex",
  buildArgs: (chunk: Chunk, commandArgs: string[]) => {
    const args = [...commandArgs];
    const lastArg = args[args.length - 1];

    if (lastArg && !lastArg.startsWith("-")) {
      args[args.length - 1] = buildContextPrefix(chunk) + lastArg;
    }

    return args;
  },
  helpText: `Usage: codex-ppp [codex-options] "<prompt>"

codex-ppp accepts all codex command options. Additional options:
  -c, --concurrency <n>  Number of parallel LLM calls (default: CPU cores)

Example:
  eslint . | codex-ppp "Fix these errors"
  eslint . | codex-ppp -c 4 "Fix these errors"`,
};

runMain(config).catch((error: unknown) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  process.exit(1);
});
