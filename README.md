# llm-parallel-per-path

Run LLM prompts in parallel, grouped by file path from any command output.

## What it does

```txt
stdin                    claude-ppp                     stdout
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ src/app.ts:10   │      │ Group by path   │      │ === src/app.ts  │
│ src/app.ts:20   │  →   │       ↓         │  →   │ LLM response    │
│ src/util.ts:5   │      │ Parallel LLM    │      │ === src/util.ts │
│ src/util.ts:15  │      │ calls           │      │ LLM response    │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

1. **Read stdin** - Takes output from any CLI (eslint, tsc, grep, git diff, etc.)
2. **Smart grouping** - Groups by file path, blocks (empty-line separated), or fixed line count (~100 lines) as fallback
3. **Parallel LLM calls** - Sends each group to LLM in parallel (CPU cores by default)
4. **Output results** - Returns LLM responses for each group

## Why?

When CLI tools like ESLint produce many errors, or when you want to give the same instruction to an LLM for many files, putting everything into context at once can cause:

- Tasks not completing
- Context compression kicking in, reducing accuracy

This tool automatically splits CLI output by file path and calls LLMs in parallel, **maintaining accuracy while processing faster**.

## CLI Commands

| Command     | LLM    |
| ----------- | ------ |
| `claude-ppp` | Claude |
| `gemini-ppp` | Gemini |
| `codex-ppp`  | Codex  |

## Usage

```bash
<command> | npx claude-ppp [options] "<prompt>"
```

Drop-in replacement for `claude` command. Accepts all `claude` options directly.

## Examples

```bash
# Usage
<some command> | npx claude-ppp --dangerously-skip-permissions "Fix these errors"
<some command> | npx codex-ppp exec --full-auto "Review it"
<some command> | npx gemini-ppp -p "Explain"

# examples
eslint . | npx claude-ppp "Fix these lint errors"
tsc --noEmit | npx claude-ppp "Explain these type errors"
rg TODO | npx claude-ppp "Prioritize these TODOs"
git diff | npx claude-ppp "Review this change"
```

## License

MIT
