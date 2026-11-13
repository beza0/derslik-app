import Anthropic from '@anthropic-ai/sdk';
import type { AppConfig } from '../config';
import { RulesProvider } from './rules';

/** Sağlayıcıdan bağımsız mesaj/blok biçimi (Anthropic Messages API ile uyumlu JSON). */
export type Block = Record<string, unknown> & { type: string };
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: Block[];
}
export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
export interface CompletionResult {
  content: Block[];
  stopReason: string | null;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
}
export interface AiProvider {
  readonly name: 'anthropic' | 'fake' | 'rules';
  complete(req: { system: string; messages: ChatMessage[]; tools: ToolDef[]; context?: { timezone: string } }): Promise<CompletionResult>;
}

/** Fiyat (USD / 1M token) — maliyet takibi için; yönetim panelinde toplanır. */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
};
export function costMicroUsd(model: string, usage: CompletionResult['usage']): number {
  if (model === 'rules' || model === 'fake') return 0;
  const p = PRICES[model] ?? PRICES['claude-opus-5-5']!;
  return Math.round(usage.inputTokens * p.in + usage.outputTokens * p.out);
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic' as const;
  private readonly client: Anthropic;
  constructor(private readonly config: AppConfig) {
    this.client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  }

  async complete(req: { system: string; messages: ChatMessage[]; tools: ToolDef[] }): Promise<CompletionResult> {
    // Opus 5.5: düşünme her zaman açık; derinlik effort ile. Reddetmede sunucu taraflı yedek model.
    const res = await this.client.beta.messages.create({
      model: this.config.AI_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
      // Girdiler sunucuda zod ile ayrıca doğrulanır.
      tools: req.tools as never,
      messages: req.messages as never,
    } as never);
    const msg = res as unknown as { content: Block[]; stop_reason: string | null; usage: { input_tokens: number; output_tokens: number }; model: string };
    return {
      content: msg.content,
      stopReason: msg.stop_reason,
      usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens },
      model: msg.model,
    };
  }
}

/**
 * GELİŞTİRME/TEST sağlayıcısı — gerçek model değildir; yanıtları "[TEST]" ile işaretlenir.
 * `/tool ad {json}` veya `/tools [{name,input},...]` biçimindeki mesajları araç çağrısına çevirir;
 * böylece önizleme/onay akışı deterministik olarak sınanır. Üretimde başlatma yapılandırmada engellenir.
 */
export class FakeProvider implements AiProvider {
  readonly name = 'fake' as const;
  async complete(req: { messages: ChatMessage[] }): Promise<CompletionResult> {
    const last = req.messages.at(-1)!;
    const usage = { inputTokens: 10, outputTokens: 10 };
    const toolResults = last.content.filter((b) => b.type === 'tool_result');
    if (toolResults.length) {
      const summary = toolResults.map((r) => String((r as { content?: unknown }).content ?? '')).join('\n');
      return { content: [{ type: 'text', text: `[TEST] Araç sonucu:\n${summary}` }], stopReason: 'end_turn', usage, model: 'fake' };
    }
    const text = last.content.filter((b) => b.type === 'text').map((b) => String(b.text)).join('\n').trim();
    let calls: { name: string; input: unknown }[] = [];
    const one = /^\/tool\s+(\w+)\s+([\s\S]+)$/.exec(text);
    const many = /^\/tools\s+([\s\S]+)$/.exec(text);
    try {
      if (one) calls = [{ name: one[1]!, input: JSON.parse(one[2]!) }];
      else if (many) calls = JSON.parse(many[1]!);
    } catch {
      return { content: [{ type: 'text', text: '[TEST] Komut JSON olarak okunamadı.' }], stopReason: 'end_turn', usage, model: 'fake' };
    }
    if (calls.length) {
      return {
        content: calls.map((c, i) => ({ type: 'tool_use', id: `toolu_fake_${Date.now()}_${i}`, name: c.name, input: c.input })),
        stopReason: 'tool_use',
        usage,
        model: 'fake',
      };
    }
    return { content: [{ type: 'text', text: `[TEST] Mesajınız alındı: ${text.slice(0, 200)}` }], stopReason: 'end_turn', usage, model: 'fake' };
  }
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
export function createProvider(config: AppConfig): AiProvider | null {
  if (config.AI_PROVIDER === 'anthropic') return new AnthropicProvider(config);
  if (config.AI_PROVIDER === 'fake') return new FakeProvider();
  if (config.AI_PROVIDER === 'rules') return new RulesProvider();
  return null;
}
