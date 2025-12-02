import { describe, it, expect } from "vitest";
import { extractPath, chunkByPath, formatChunks, type Chunk } from "./chunker";

describe("extractPath", () => {
  describe("standard path:line:col format", () => {
    it("extracts path from eslint-style output", () => {
      expect(extractPath("src/app.ts:10:5: error some-rule")).toBe("src/app.ts");
    });

    it("extracts path from tsc-style output", () => {
      expect(extractPath("src/utils/math.ts:42:10: error TS2322")).toBe("src/utils/math.ts");
    });

    it("extracts path with line only (no column)", () => {
      expect(extractPath("src/index.js:100: warning")).toBe("src/index.js");
    });

    it("extracts path from grep/rg output", () => {
      expect(extractPath("src/components/Button.tsx:25:3:   TODO: fix this")).toBe(
        "src/components/Button.tsx",
      );
    });
  });

  describe("parentheses format path(line,col)", () => {
    it("extracts path from tsc parentheses format", () => {
      expect(extractPath("src/app.ts(10,5): error TS2322")).toBe("src/app.ts");
    });

    it("extracts path from nested directory", () => {
      expect(extractPath("packages/core/src/index.ts(1,1): error")).toBe(
        "packages/core/src/index.ts",
      );
    });
  });

  describe("git diff format", () => {
    it("extracts path from git diff header", () => {
      expect(extractPath("diff --git a/src/app.ts b/src/app.ts")).toBe("src/app.ts");
    });

    it("extracts path with spaces in name", () => {
      expect(extractPath("diff --git a/src/my file.ts b/src/my file.ts")).toBe("src/my file.ts");
    });
  });

  describe("oxlint format", () => {
    it("extracts path from oxlint unicode format", () => {
      expect(extractPath("   ╭─[src/app.ts:10:3]")).toBe("src/app.ts");
    });

    it("extracts path from oxlint ASCII fallback format", () => {
      expect(extractPath("   ,-[src/gemini.ts:1:1]")).toBe("src/gemini.ts");
    });
  });

  describe("simple path with dash/colon separator", () => {
    it("extracts path with dash separator", () => {
      expect(extractPath("src/app.ts - some warning message")).toBe("src/app.ts");
    });

    it("extracts path with colon separator", () => {
      expect(extractPath("config.json: invalid syntax")).toBe("config.json");
    });
  });

  describe("edge cases", () => {
    it("returns null for lines without paths", () => {
      expect(extractPath("  Some continuation message")).toBeNull();
    });

    it("returns null for empty lines", () => {
      expect(extractPath("")).toBeNull();
    });

    it("returns null for summary lines", () => {
      expect(extractPath("Found 10 errors in 3 files")).toBeNull();
    });

    it("handles paths with various extensions", () => {
      expect(extractPath("test.spec.ts:10:5: error")).toBe("test.spec.ts");
      expect(extractPath("styles.module.css:5:1: warning")).toBe("styles.module.css");
      expect(extractPath("README.md:1:1: error")).toBe("README.md");
    });
  });
});

describe("chunkByPath", () => {
  it("groups lines by file path", () => {
    const input = `src/app.ts:10:5: error TS2322
src/app.ts:15:3: error TS2345
src/utils.ts:5:1: warning
src/utils.ts:10:1: error TS2322`;

    const result = chunkByPath(input);

    expect(result).toStrictEqual([
      {
        path: "src/app.ts",
        lines: ["src/app.ts:10:5: error TS2322", "src/app.ts:15:3: error TS2345"],
      },
      {
        path: "src/utils.ts",
        lines: ["src/utils.ts:5:1: warning", "src/utils.ts:10:1: error TS2322"],
      },
    ]);
  });

  it("includes continuation lines with the previous path", () => {
    const input = `src/app.ts:10:5: error TS2322
  Type 'string' is not assignable to type 'number'.
  This is a continuation of the error message.
src/utils.ts:5:1: warning`;

    const result = chunkByPath(input);

    expect(result).toStrictEqual([
      {
        path: "src/app.ts",
        lines: [
          "src/app.ts:10:5: error TS2322",
          "  Type 'string' is not assignable to type 'number'.",
          "  This is a continuation of the error message.",
        ],
      },
      {
        path: "src/utils.ts",
        lines: ["src/utils.ts:5:1: warning"],
      },
    ]);
  });

  it("filters out unmatched header lines when real paths exist", () => {
    const input = `Running eslint...
Configuration loaded.
src/app.ts:10:5: error no-unused-vars`;

    const result = chunkByPath(input);

    expect(result).toStrictEqual([
      {
        path: "src/app.ts",
        lines: ["src/app.ts:10:5: error no-unused-vars"],
      },
    ]);
  });

  it("skips empty lines", () => {
    const input = `src/app.ts:10:5: error

src/utils.ts:5:1: warning`;

    const result = chunkByPath(input);

    expect(result).toStrictEqual([
      {
        path: "src/app.ts",
        lines: ["src/app.ts:10:5: error"],
      },
      {
        path: "src/utils.ts",
        lines: ["src/utils.ts:5:1: warning"],
      },
    ]);
  });

  it("handles git diff output", () => {
    const input = `diff --git a/src/app.ts b/src/app.ts
index 1234567..abcdefg 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -10,3 +10,4 @@
 existing line
+added line
diff --git a/src/utils.ts b/src/utils.ts
--- a/src/utils.ts
+++ b/src/utils.ts`;

    const result = chunkByPath(input);

    expect(result).toStrictEqual([
      {
        path: "src/app.ts",
        lines: [
          "diff --git a/src/app.ts b/src/app.ts",
          "index 1234567..abcdefg 100644",
          "--- a/src/app.ts",
          "+++ b/src/app.ts",
          "@@ -10,3 +10,4 @@",
          " existing line",
          "+added line",
        ],
      },
      {
        path: "src/utils.ts",
        lines: [
          "diff --git a/src/utils.ts b/src/utils.ts",
          "--- a/src/utils.ts",
          "+++ b/src/utils.ts",
        ],
      },
    ]);
  });

  it("returns empty array for empty input", () => {
    const result = chunkByPath("");
    expect(result).toStrictEqual([]);
  });

  it("returns empty array for whitespace-only input", () => {
    const result = chunkByPath("   \n\n   \n");
    expect(result).toStrictEqual([]);
  });

  it("uses custom path extractor when provided", () => {
    const input = `FILE: src/app.ts
error found
FILE: src/utils.ts
another error`;

    const customExtractor = (line: string): string | null => {
      const match = line.match(/^FILE: (.+)$/);
      return match?.[1] ?? null;
    };

    const result = chunkByPath(input, { pathExtractor: customExtractor });

    expect(result).toStrictEqual([
      {
        path: "src/app.ts",
        lines: ["FILE: src/app.ts", "error found"],
      },
      {
        path: "src/utils.ts",
        lines: ["FILE: src/utils.ts", "another error"],
      },
    ]);
  });

  it("preserves order of first appearance", () => {
    const input = `src/c.ts:1:1: error
src/a.ts:1:1: error
src/b.ts:1:1: error
src/a.ts:2:1: error`;

    const result = chunkByPath(input);

    expect(result).toStrictEqual([
      {
        path: "src/c.ts",
        lines: ["src/c.ts:1:1: error"],
      },
      {
        path: "src/a.ts",
        lines: ["src/a.ts:1:1: error", "src/a.ts:2:1: error"],
      },
      {
        path: "src/b.ts",
        lines: ["src/b.ts:1:1: error"],
      },
    ]);
  });
});

describe("formatChunks", () => {
  it("formats chunks with headers", () => {
    const chunks: Chunk[] = [
      { path: "src/app.ts", lines: ["line 1", "line 2"] },
      { path: "src/utils.ts", lines: ["line 3"] },
    ];

    const result = formatChunks(chunks);

    expect(result).toBe(
      `=== src/app.ts ===
line 1
line 2

=== src/utils.ts ===
line 3`,
    );
  });

  it("handles empty chunks array", () => {
    const result = formatChunks([]);
    expect(result).toBe("");
  });

  it("handles chunk with single line", () => {
    const chunks: Chunk[] = [{ path: "test.ts", lines: ["single line"] }];
    const result = formatChunks(chunks);
    expect(result).toBe("=== test.ts ===\nsingle line");
  });
});

describe("real-world CLI output scenarios", () => {
  it("handles eslint output", () => {
    const eslintOutput = `/Users/dev/project/src/App.tsx:5:10: error  'useState' is defined but never used  @typescript-eslint/no-unused-vars
/Users/dev/project/src/App.tsx:12:3: warning  Unexpected console statement  no-console
/Users/dev/project/src/utils/helpers.ts:8:1: error  Missing return type on function  @typescript-eslint/explicit-function-return-type`;

    const result = chunkByPath(eslintOutput);

    expect(result).toStrictEqual([
      {
        path: "/Users/dev/project/src/App.tsx",
        lines: [
          "/Users/dev/project/src/App.tsx:5:10: error  'useState' is defined but never used  @typescript-eslint/no-unused-vars",
          "/Users/dev/project/src/App.tsx:12:3: warning  Unexpected console statement  no-console",
        ],
      },
      {
        path: "/Users/dev/project/src/utils/helpers.ts",
        lines: [
          "/Users/dev/project/src/utils/helpers.ts:8:1: error  Missing return type on function  @typescript-eslint/explicit-function-return-type",
        ],
      },
    ]);
  });

  it("handles tsc output", () => {
    const tscOutput = `src/index.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.

10     const x: number = "hello";
       ~

src/utils.ts:5:10 - error TS2304: Cannot find name 'foo'.

5     return foo();
             ~~~`;

    const result = chunkByPath(tscOutput);

    expect(result).toStrictEqual([
      {
        path: "src/index.ts",
        lines: [
          "src/index.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.",
          '10     const x: number = "hello";',
          "       ~",
        ],
      },
      {
        path: "src/utils.ts",
        lines: [
          "src/utils.ts:5:10 - error TS2304: Cannot find name 'foo'.",
          "5     return foo();",
          "             ~~~",
        ],
      },
    ]);
  });

  it("handles ripgrep output", () => {
    const rgOutput = `src/app.ts:10:  // TODO: implement this
src/app.ts:25:  // TODO: add error handling
src/utils.ts:5:  // TODO: optimize this function
src/components/Button.tsx:100:  // FIXME: memory leak`;

    const result = chunkByPath(rgOutput);

    expect(result).toStrictEqual([
      {
        path: "src/app.ts",
        lines: [
          "src/app.ts:10:  // TODO: implement this",
          "src/app.ts:25:  // TODO: add error handling",
        ],
      },
      {
        path: "src/utils.ts",
        lines: ["src/utils.ts:5:  // TODO: optimize this function"],
      },
      {
        path: "src/components/Button.tsx",
        lines: ["src/components/Button.tsx:100:  // FIXME: memory leak"],
      },
    ]);
  });

  it("handles eslint compact format", () => {
    const eslintCompact = `/Users/dev/project/src/App.tsx:5:10: error - 'useState' is defined but never used. (@typescript-eslint/no-unused-vars)
/Users/dev/project/src/App.tsx:12:3: warning - Unexpected console statement. (no-console)
/Users/dev/project/src/utils/helpers.ts:8:1: error - Missing return type on function. (@typescript-eslint/explicit-function-return-type)
/Users/dev/project/src/utils/helpers.ts:15:5: warning - Unexpected any. (@typescript-eslint/no-explicit-any)`;

    const result = chunkByPath(eslintCompact);

    expect(result).toStrictEqual([
      {
        path: "/Users/dev/project/src/App.tsx",
        lines: [
          "/Users/dev/project/src/App.tsx:5:10: error - 'useState' is defined but never used. (@typescript-eslint/no-unused-vars)",
          "/Users/dev/project/src/App.tsx:12:3: warning - Unexpected console statement. (no-console)",
        ],
      },
      {
        path: "/Users/dev/project/src/utils/helpers.ts",
        lines: [
          "/Users/dev/project/src/utils/helpers.ts:8:1: error - Missing return type on function. (@typescript-eslint/explicit-function-return-type)",
          "/Users/dev/project/src/utils/helpers.ts:15:5: warning - Unexpected any. (@typescript-eslint/no-explicit-any)",
        ],
      },
    ]);
  });

  it("handles eslint unix format", () => {
    const eslintUnix = `src/components/Button.tsx:10:5: 'props' is defined but never used. [Error/no-unused-vars]
src/components/Button.tsx:25:10: Missing semicolon. [Error/semi]
src/hooks/useAuth.ts:3:1: Prefer default export. [Warning/import/prefer-default-export]`;

    const result = chunkByPath(eslintUnix);

    expect(result).toStrictEqual([
      {
        path: "src/components/Button.tsx",
        lines: [
          "src/components/Button.tsx:10:5: 'props' is defined but never used. [Error/no-unused-vars]",
          "src/components/Button.tsx:25:10: Missing semicolon. [Error/semi]",
        ],
      },
      {
        path: "src/hooks/useAuth.ts",
        lines: [
          "src/hooks/useAuth.ts:3:1: Prefer default export. [Warning/import/prefer-default-export]",
        ],
      },
    ]);
  });

  it("handles stylelint output", () => {
    const stylelintOutput = `src/styles/main.css:10:5: Unexpected duplicate selector ".container" (no-duplicate-selectors)
src/styles/main.css:25:3: Expected indentation of 2 spaces (indentation)
src/components/Button.module.css:5:1: Unexpected unknown property "colour" (property-no-unknown)
src/components/Button.module.css:12:10: Unexpected unit "px" (unit-disallowed-list)`;

    const result = chunkByPath(stylelintOutput);

    expect(result).toStrictEqual([
      {
        path: "src/styles/main.css",
        lines: [
          'src/styles/main.css:10:5: Unexpected duplicate selector ".container" (no-duplicate-selectors)',
          "src/styles/main.css:25:3: Expected indentation of 2 spaces (indentation)",
        ],
      },
      {
        path: "src/components/Button.module.css",
        lines: [
          'src/components/Button.module.css:5:1: Unexpected unknown property "colour" (property-no-unknown)',
          'src/components/Button.module.css:12:10: Unexpected unit "px" (unit-disallowed-list)',
        ],
      },
    ]);
  });

  it("handles stylelint string format with severity", () => {
    const stylelintString = `src/App.scss:15:3: error - Unexpected empty block (block-no-empty)
src/App.scss:22:1: warning - Expected no more than 1 empty line (max-empty-lines)
src/variables.scss:5:10: error - Unexpected named color "red" (color-named)`;

    const result = chunkByPath(stylelintString);

    expect(result).toStrictEqual([
      {
        path: "src/App.scss",
        lines: [
          "src/App.scss:15:3: error - Unexpected empty block (block-no-empty)",
          "src/App.scss:22:1: warning - Expected no more than 1 empty line (max-empty-lines)",
        ],
      },
      {
        path: "src/variables.scss",
        lines: ['src/variables.scss:5:10: error - Unexpected named color "red" (color-named)'],
      },
    ]);
  });

  it("handles oxlint output (block-based fallback)", () => {
    const oxlintOutput = `⚠ eslint(no-unused-vars): 'foo' is assigned a value but never used.
   ╭─[node_modules/oxlint/dist/lint.js:77:4]
76 │   const foo = 'bar';
77 │   return;
   · ────────
   ╰────
  help: Consider removing this declaration.

⚠ eslint(no-unused-vars): 'baz' is assigned a value but never used.
   ╭─[src/app.ts:10:3]
 9 │   const baz = 123;
10 │   console.log('hello');
   · ──────────────────────
   ╰────
  help: Consider removing this declaration.`;

    const result = chunkByPath(oxlintOutput);

    expect(result).toStrictEqual([
      {
        path: "node_modules/oxlint/dist/lint.js",
        lines: [
          "⚠ eslint(no-unused-vars): 'foo' is assigned a value but never used.",
          "   ╭─[node_modules/oxlint/dist/lint.js:77:4]",
          "76 │   const foo = 'bar';",
          "77 │   return;",
          "   · ────────",
          "   ╰────",
          "  help: Consider removing this declaration.",
        ],
      },
      {
        path: "src/app.ts",
        lines: [
          "⚠ eslint(no-unused-vars): 'baz' is assigned a value but never used.",
          "   ╭─[src/app.ts:10:3]",
          " 9 │   const baz = 123;",
          "10 │   console.log('hello');",
          "   · ──────────────────────",
          "   ╰────",
          "  help: Consider removing this declaration.",
        ],
      },
    ]);
  });

  it("handles oxlint output with consecutive same-path errors", () => {
    const oxlintOutput = `⚠ eslint(no-unused-vars): 'x' is unused.
   ╭─[src/utils.ts:5:3]
 4 │   const x = 1;
 5 │   const y = 2;
   ╰────

⚠ eslint(no-unused-vars): 'y' is unused.
   ╭─[src/utils.ts:6:3]
 5 │   const y = 2;
 6 │   return;
   ╰────`;

    const result = chunkByPath(oxlintOutput);

    expect(result).toStrictEqual([
      {
        path: "src/utils.ts",
        lines: [
          "⚠ eslint(no-unused-vars): 'x' is unused.",
          "   ╭─[src/utils.ts:5:3]",
          " 4 │   const x = 1;",
          " 5 │   const y = 2;",
          "   ╰────",
          "⚠ eslint(no-unused-vars): 'y' is unused.",
          "   ╭─[src/utils.ts:6:3]",
          " 5 │   const y = 2;",
          " 6 │   return;",
          "   ╰────",
        ],
      },
    ]);
  });

  it("handles oxlint ASCII fallback format (,-[path:line:col])", () => {
    const oxlintOutput = `  ! eslint-plugin-unicorn(no-empty-file): Empty files are not allowed.
   ,-[src/gemini.ts:1:1]
   \`----
  help: Delete this file or add some code to it.

  ! eslint-plugin-unicorn(no-empty-file): Empty files are not allowed.
   ,-[src/codex.ts:1:1]
   \`----
  help: Delete this file or add some code to it.`;

    const result = chunkByPath(oxlintOutput);

    expect(result).toStrictEqual([
      {
        path: "src/gemini.ts",
        lines: [
          "  ! eslint-plugin-unicorn(no-empty-file): Empty files are not allowed.",
          "   ,-[src/gemini.ts:1:1]",
          "   `----",
          "  help: Delete this file or add some code to it.",
        ],
      },
      {
        path: "src/codex.ts",
        lines: [
          "  ! eslint-plugin-unicorn(no-empty-file): Empty files are not allowed.",
          "   ,-[src/codex.ts:1:1]",
          "   `----",
          "  help: Delete this file or add some code to it.",
        ],
      },
    ]);
  });
});
