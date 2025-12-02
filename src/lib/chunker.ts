export interface Chunk {
  path: string;
  lines: string[];
}

export interface ChunkerOptions {
  pathExtractor?: (line: string) => string | null;
  linesPerChunk?: number;
}

const PATH_PATTERNS: RegExp[] = [
  // oxlint: ╭─[path:line:col] or ,-[path:line:col]
  /^\s*[╭,][-─]\[([^\]:]+):(\d+):\d+\]/,
  // Standard: path:line:col or path:line
  /^([^\s:()]+\.[a-zA-Z0-9]+):(\d+)(?::\d+)?[:\s]/,
  // tsc: path(line,col)
  /^([^\s:()]+\.[a-zA-Z0-9]+)\(\d+,\d+\):/,
  // git diff
  /^diff --git a\/(.+?) b\//,
  // Simple: path - message or path: message
  /^([^\s:()]+\.[a-zA-Z0-9]+)\s*[-:]/,
];

export function extractPath(line: string): string | null {
  for (const pattern of PATH_PATTERNS) {
    const match = line.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

function chunkByPathOnly(lines: string[], pathExtractor: (line: string) => string | null): Chunk[] {
  const chunks = new Map<string, string[]>();
  const unmatchedLines: string[] = [];
  let currentPath: string | null = null;

  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }

    const extractedPath = pathExtractor(line);

    if (extractedPath) {
      currentPath = extractedPath;
      if (!chunks.has(currentPath)) {
        chunks.set(currentPath, []);
      }
      chunks.get(currentPath)!.push(line);
    } else if (currentPath) {
      chunks.get(currentPath)!.push(line);
    } else {
      unmatchedLines.push(line);
    }
  }

  const result: Chunk[] = [];

  if (unmatchedLines.length > 0) {
    result.push({
      path: "__unmatched__",
      lines: unmatchedLines,
    });
  }

  for (const [path, pathLines] of chunks) {
    result.push({
      path,
      lines: pathLines,
    });
  }

  return result;
}

function chunkByBlock(input: string, pathExtractor: (line: string) => string | null): Chunk[] {
  // Split by empty lines (blocks)
  const blocks = input.split(/\n\s*\n/).filter((b) => b.trim() !== "");
  const blockChunks: Chunk[] = [];

  for (const block of blocks) {
    const blockLines = block.split("\n").filter((l) => l.trim() !== "");

    // Find path anywhere in block
    let path: string | null = null;
    for (const line of blockLines) {
      path = pathExtractor(line);
      if (path) break;
    }

    if (path) {
      blockChunks.push({ path, lines: blockLines });
    }
  }

  // Merge consecutive chunks with the same path
  const result: Chunk[] = [];
  for (const chunk of blockChunks) {
    const last = result[result.length - 1];
    if (last && last.path === chunk.path) {
      last.lines.push(...chunk.lines);
    } else {
      result.push({ path: chunk.path, lines: [...chunk.lines] });
    }
  }

  return result;
}

function looksLikeBlockFormat(
  input: string,
  pathExtractor: (line: string) => string | null,
): boolean {
  const blocks = input.split(/\n\s*\n/).filter((b) => b.trim() !== "");
  if (blocks.length <= 1) return false;

  // Check first block: does it have non-path content before the path line?
  // AND does it actually contain a path? (excludes pure header blocks)
  const firstBlock = blocks[0];
  if (!firstBlock) return false;

  const firstBlockLines = firstBlock.split("\n").filter((l) => l.trim() !== "");
  let hasNonPathBeforePath = false;
  let hasPath = false;

  for (const line of firstBlockLines) {
    const path = pathExtractor(line);
    if (path) {
      hasPath = true;
      break;
    }
    hasNonPathBeforePath = true;
  }

  // Block format: non-path line before path, AND block contains a path
  // (This matches oxlint where error message comes before path)
  return hasNonPathBeforePath && hasPath;
}

const DEFAULT_LINES_PER_CHUNK = 100;

function chunkByLineCount(lines: string[], linesPerChunk: number): Chunk[] {
  const nonEmptyLines = lines.filter((l) => l.trim() !== "");
  if (nonEmptyLines.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  for (let i = 0; i < nonEmptyLines.length; i += linesPerChunk) {
    const chunkLines = nonEmptyLines.slice(i, i + linesPerChunk);
    const chunkNumber = Math.floor(i / linesPerChunk) + 1;
    chunks.push({
      path: `chunk-${chunkNumber}`,
      lines: chunkLines,
    });
  }

  return chunks;
}

export function chunkByPath(input: string, options: ChunkerOptions = {}): Chunk[] {
  const { pathExtractor = extractPath, linesPerChunk = DEFAULT_LINES_PER_CHUNK } = options;
  const lines = input.split("\n");

  // Check if input looks like oxlint format (blocks with message before path)
  if (looksLikeBlockFormat(input, pathExtractor)) {
    const blockResult = chunkByBlock(input, pathExtractor);
    if (blockResult.length > 0) {
      return blockResult;
    }
  }

  // Use path-based chunking
  const pathResult = chunkByPathOnly(lines, pathExtractor);

  // Filter out __unmatched__ header lines if we have real paths
  const hasRealPaths = pathResult.some((c) => c.path !== "__unmatched__");
  if (hasRealPaths) {
    return pathResult.filter((c) => c.path !== "__unmatched__");
  }

  // Fallback: no paths found, split by line count
  return chunkByLineCount(lines, linesPerChunk);
}

export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  return new Promise((resolve, reject) => {
    process.stdin.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    process.stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    process.stdin.on("error", reject);
  });
}

export function formatChunks(chunks: Chunk[]): string {
  return chunks
    .map((chunk) => {
      const header = `=== ${chunk.path} ===`;
      const content = chunk.lines.join("\n");
      return `${header}\n${content}`;
    })
    .join("\n\n");
}
