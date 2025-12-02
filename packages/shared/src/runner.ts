import { spawn } from "node:child_process";
import { cpus, platform } from "node:os";
import { chunkByPath, readStdin, type Chunk } from "./chunker.ts";

export interface Options {
  concurrency: number;
  commandArgs: string[];
}

export interface ProviderConfig {
  name: string;
  command: string;
  buildArgs: (chunk: Chunk, commandArgs: string[]) => string[];
  helpText: string;
}

const COLORS = [
  "\x1b[36m", // cyan
  "\x1b[33m", // yellow
  "\x1b[35m", // magenta
  "\x1b[32m", // green
  "\x1b[34m", // blue
  "\x1b[91m", // bright red
  "\x1b[92m", // bright green
  "\x1b[93m", // bright yellow
  "\x1b[94m", // bright blue
  "\x1b[95m", // bright magenta
  "\x1b[96m", // bright cyan
];
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

// Filter out control characters and artifacts from script command output
function cleanOutput(str: string): string {
  return (
    str
      // Remove control characters (except \x1b for ANSI codes)
      .replace(/[\x00-\x08\x0B-\x1A\x1C-\x1F]/g, "")
      // Remove ^D (literal string from script command)
      .replace(/\^D/g, "")
      // Remove other control character representations
      .replace(/\^\[\[[A-Za-z]/g, "")
  );
}

export function parseOptions(): Options {
  const args = process.argv.slice(2);

  let concurrency = cpus().length;
  const commandArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--concurrency" || arg === "-c") {
      const next = args[i + 1];
      if (next) {
        concurrency = parseInt(next, 10);
        i++;
      }
    } else {
      commandArgs.push(arg);
    }
  }

  return { concurrency, commandArgs };
}

export function buildContextPrefix(chunk: Chunk): string {
  const content = chunk.lines.join("\n");
  return `File: ${chunk.path}\n\n${content}\n\n---\n\n`;
}

export async function callCommandStreaming(
  chunk: Chunk,
  command: string,
  args: string[],
  colorIndex: number,
  maxPathLength: number,
): Promise<{ path: string; success: boolean }> {
  const color = COLORS[colorIndex % COLORS.length]!;
  const paddedPath = `[${chunk.path}]`.padEnd(maxPathLength + 2);
  const prefix = `${color}${BOLD}${paddedPath}${RESET}${color}`;

  return new Promise((resolve, reject) => {
    // Use `script` command to create a pseudo-TTY for tools that require it
    let spawnCommand: string;
    let spawnArgs: string[];

    if (platform() === "darwin") {
      // macOS: script -q /dev/null command args...
      spawnCommand = "script";
      spawnArgs = ["-q", "/dev/null", command, ...args];
    } else if (platform() === "linux") {
      // Linux: script -q -c "command args..." /dev/null
      const escapedCommand = [command, ...args]
        .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
        .join(" ");
      spawnCommand = "script";
      spawnArgs = ["-q", "-c", escapedCommand, "/dev/null"];
    } else {
      // Windows or other: run directly (may fail if TTY required)
      spawnCommand = command;
      spawnArgs = args;
    }

    const proc = spawn(spawnCommand, spawnArgs, { stdio: ["ignore", "pipe", "pipe"] });

    proc.stdout.on("data", (data: Buffer) => {
      const lines = cleanOutput(data.toString()).split("\n");
      for (const line of lines) {
        if (line.trim()) {
          process.stdout.write(`${prefix} ${line}${RESET}\n`);
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      const lines = cleanOutput(data.toString()).split("\n");
      for (const line of lines) {
        if (line.trim()) {
          process.stderr.write(`${prefix} ${line}${RESET}\n`);
        }
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ path: chunk.path, success: true });
      } else {
        process.stderr.write(`${prefix} exited with code ${code}${RESET}\n`);
        resolve({ path: chunk.path, success: false });
      }
    });

    proc.on("error", (err) => {
      process.stderr.write(`${prefix} error: ${err.message}${RESET}\n`);
      reject(err);
    });
  });
}

export async function runWithConcurrencyStreaming(
  chunks: Chunk[],
  concurrency: number,
  command: string,
  buildArgs: (chunk: Chunk) => string[],
): Promise<void> {
  const executing = new Set<Promise<void>>();
  let colorIndex = 0;
  const maxPathLength = Math.max(...chunks.map((c) => c.path.length));

  for (const chunk of chunks) {
    const currentColorIndex = colorIndex++;
    const promise = callCommandStreaming(
      chunk,
      command,
      buildArgs(chunk),
      currentColorIndex,
      maxPathLength,
    ).then(() => {
      executing.delete(promise);
    });
    executing.add(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

export async function runMain(config: ProviderConfig): Promise<void> {
  const options = parseOptions();

  if (options.commandArgs.includes("--help") || options.commandArgs.includes("-h")) {
    console.log(config.helpText);
    process.exit(0);
  }

  const input = await readStdin();
  if (!input.trim()) {
    console.error("Error: no input received from stdin");
    process.exit(1);
  }

  const chunks = chunkByPath(input);
  if (chunks.length === 0) {
    console.error("Error: no file paths found in input");
    process.exit(1);
  }

  console.error(`Processing ${chunks.length} file(s) with concurrency ${options.concurrency}...`);

  await runWithConcurrencyStreaming(chunks, options.concurrency, config.command, (chunk) =>
    config.buildArgs(chunk, options.commandArgs),
  );
}

export type { Chunk } from "./chunker.ts";
