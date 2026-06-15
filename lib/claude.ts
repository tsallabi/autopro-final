/**
 * Claude (Anthropic) brain for AutoPro.
 *
 * Single shared client + helpers used by the admin agentic assistant and the
 * customer chat assistant. Reuses the EXISTING Anthropic key — reads
 * ANTHROPIC_API_KEY from the environment (the same variable the owner's other
 * apps already use). No new key is introduced.
 *
 * Safe-by-default: if ANTHROPIC_API_KEY is unset, isEnabled() returns false and
 * every caller short-circuits with a clear message — the app boots and runs
 * exactly as before.
 *
 * Model: Claude Opus 4.8 (claude-opus-4-8) per the owner's choice.
 * Cost control: prompt caching (cache_control: ephemeral) on the stable system
 * prompt + tool list, so repeated calls only pay ~0.1x for the cached prefix.
 */
import Anthropic from '@anthropic-ai/sdk';

// Per the owner: Opus 4.8 for everything. Overridable via env without code edit.
export const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';

let client: Anthropic | null = null;

export function isEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient(): Anthropic {
  if (!client) {
    // SDK reads ANTHROPIC_API_KEY from the environment by default.
    client = new Anthropic();
  }
  return client;
}

export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: any;
  /** Server-side executor. Return a string (or JSON-stringifiable value). */
  run: (input: any) => Promise<string> | string;
  /**
   * If true, the agent loop will NOT auto-execute this tool — it returns a
   * pending-confirmation marker instead. Reserved for destructive actions.
   * (Not used yet; all shipped tools are read-only or reversible.)
   */
  requiresConfirmation?: boolean;
}

export interface AgentResult {
  text: string;
  /** Human-readable list of tool calls that were executed, for the UI log. */
  actions: Array<{ tool: string; input: any; ok: boolean; result?: string; error?: string }>;
  stopReason: string | null;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

/**
 * Run a bounded agentic loop: Claude may call the provided tools repeatedly
 * until it produces a final text answer or hits maxIterations.
 *
 * - Adaptive thinking + high effort (Opus 4.8 reasons well for multi-step work).
 * - Prompt caching on the system prompt + tool definitions (the stable prefix).
 * - Tools execute server-side; results are fed back to Claude automatically.
 */
export async function runAgent(opts: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: ClaudeTool[];
  maxIterations?: number;
  maxTokens?: number;
}): Promise<AgentResult> {
  const c = getClient();
  const maxIterations = opts.maxIterations ?? 8;
  const maxTokens = opts.maxTokens ?? 4096;

  // Tool schemas for the API (without the run() executor). Mark the last tool
  // with cache_control so tools + system are cached together as one prefix.
  const apiTools: Anthropic.ToolUnion[] = opts.tools.map((t, i) => {
    const def: any = {
      name: t.name,
      description: t.description,
      input_schema: t.input_schema,
    };
    if (i === opts.tools.length - 1) {
      def.cache_control = { type: 'ephemeral' };
    }
    return def;
  });

  const byName = new Map(opts.tools.map((t) => [t.name, t]));
  const messages: Anthropic.MessageParam[] = [...opts.messages];
  const actions: AgentResult['actions'] = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let finalText = '';
  let stopReason: string | null = null;

  for (let iter = 0; iter < maxIterations; iter++) {
    const resp = await c.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high' } as any,
      system: [
        { type: 'text', text: opts.system, cache_control: { type: 'ephemeral' } },
      ],
      tools: apiTools,
      messages,
    });

    usage.input += resp.usage?.input_tokens || 0;
    usage.output += resp.usage?.output_tokens || 0;
    usage.cacheRead += (resp.usage as any)?.cache_read_input_tokens || 0;
    usage.cacheWrite += (resp.usage as any)?.cache_creation_input_tokens || 0;
    stopReason = resp.stop_reason;

    // Collect any text the model produced this turn.
    for (const block of resp.content) {
      if (block.type === 'text') finalText += (finalText ? '\n' : '') + block.text;
    }

    if (resp.stop_reason !== 'tool_use') {
      // Done — no more tool calls requested.
      break;
    }

    // Echo the assistant turn (including tool_use blocks) back into history.
    messages.push({ role: 'assistant', content: resp.content });

    // Execute every requested tool and gather results.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== 'tool_use') continue;
      const tool = byName.get(block.name);
      if (!tool) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Unknown tool: ${block.name}`,
          is_error: true,
        });
        actions.push({ tool: block.name, input: block.input, ok: false, error: 'unknown tool' });
        continue;
      }
      try {
        const out = await tool.run(block.input);
        const text = typeof out === 'string' ? out : JSON.stringify(out);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: text });
        actions.push({ tool: block.name, input: block.input, ok: true, result: text.slice(0, 500) });
      } catch (e: any) {
        const msg = e?.message || String(e);
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${msg}`, is_error: true });
        actions.push({ tool: block.name, input: block.input, ok: false, error: msg });
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return { text: finalText.trim(), actions, stopReason, usage };
}

/**
 * Single-shot chat completion (no tools) with a cached system prompt. Used by
 * the customer chat assistant for general Q&A.
 */
export async function chatOnce(opts: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: ClaudeTool[];
  maxTokens?: number;
}): Promise<AgentResult> {
  // The customer assistant may also use a couple of read-only tools, so reuse
  // the same loop with a small iteration cap.
  return runAgent({
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools ?? [],
    maxIterations: opts.tools && opts.tools.length ? 4 : 1,
    maxTokens: opts.maxTokens ?? 1500,
  });
}
