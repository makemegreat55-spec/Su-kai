import type { EmbeddingConfig, EmbeddingProvider } from './types';

export type ProviderModelOption = {
    id: string;
    name: string;
    description?: string;
    contextLength?: number;
    modality?: string;
};

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENROUTER_EMBEDDING_MODELS_URL = `${OPENROUTER_BASE_URL}/embeddings/models`;
export const OPENROUTER_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
export const OPENROUTER_RERANK_MODEL = 'cohere/rerank-v3.5';

export const OPENROUTER_EMBEDDING_MODELS: ProviderModelOption[] = [
    { id: 'openai/text-embedding-3-small', name: 'Text Embedding 3 Small', modality: 'embeddings' },
    { id: 'openai/text-embedding-3-large', name: 'Text Embedding 3 Large', modality: 'embeddings' },
    { id: 'baai/bge-m3', name: 'BGE M3', modality: 'embeddings' },
    { id: 'perplexity/pplx-embed-v1', name: 'pplx-embed-v1', modality: 'embeddings' },
];

export const OPENROUTER_RERANK_MODELS: ProviderModelOption[] = [
    { id: OPENROUTER_RERANK_MODEL, name: 'Cohere Rerank v3.5', modality: 'rerank' },
];

export function normalizeApiKey(value?: string): string {
    return String(value || '')
        .trim()
        .replace(/^authorization\s*:\s*/i, '')
        .trim()
        .replace(/^bearer\s+/i, '')
        .trim();
}

export function normalizeBaseUrl(value?: string): string {
    let url = String(value || '').trim().replace(/\/+$/, '');
    if (/^\/\//.test(url)) url = `https:${url}`;
    if (/^openrouter\.ai(\/|$)/i.test(url)) url = `https://${url}`;
    url = url.replace('ai.siliconflow.cn', 'api.siliconflow.cn');
    return url;
}

export function isOpenRouterHost(value?: string): boolean {
    const raw = normalizeBaseUrl(value);
    if (!raw) return false;
    try {
        return /(^|\.)openrouter\.ai$/i.test(new URL(raw).hostname);
    } catch {
        return /(^|\/\/|\.)openrouter\.ai(\/|$)/i.test(raw);
    }
}

export function inferEmbeddingProvider(
    provider?: string,
    baseUrl?: string,
    modelsUrl?: string,
): EmbeddingProvider {
    const p = String(provider || '').trim().toLowerCase();
    if (p === 'openrouter') return 'openrouter';
    if (p === 'custom') return 'custom';
    if (isOpenRouterHost(baseUrl) || isOpenRouterHost(modelsUrl)) return 'openrouter';
    return 'openai-compatible';
}

export function normalizeOpenRouterBaseUrl(value?: string): string {
    const raw = normalizeBaseUrl(value) || OPENROUTER_BASE_URL;
    try {
        const url = new URL(raw);
        if (!/(^|\.)openrouter\.ai$/i.test(url.hostname)) return raw;
        return `${url.origin}/api/v1`;
    } catch {
        return OPENROUTER_BASE_URL;
    }
}

export function normalizeOpenRouterModelsUrl(value?: string): string {
    const raw = normalizeBaseUrl(value);
    if (!raw) return OPENROUTER_EMBEDDING_MODELS_URL;
    try {
        const url = new URL(raw);
        if (!/(^|\.)openrouter\.ai$/i.test(url.hostname)) return raw;
        return `${url.origin}/api/v1/embeddings/models`;
    } catch {
        return OPENROUTER_EMBEDDING_MODELS_URL;
    }
}

function appendEndpoint(baseUrl: string, endpoint: string): string {
    const base = normalizeBaseUrl(baseUrl);
    const suffix = endpoint.replace(/^\/+/, '');
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`/${escaped}$`, 'i').test(base)) return base;
    return `${base}/${suffix}`;
}

export function normalizeEmbeddingConfig(config: EmbeddingConfig): EmbeddingConfig {
    const provider = inferEmbeddingProvider(config.provider, config.baseUrl, config.modelsUrl);
    const baseUrl = provider === 'openrouter'
        ? normalizeOpenRouterBaseUrl(config.baseUrl)
        : normalizeBaseUrl(config.baseUrl);
    const modelsUrl = provider === 'openrouter'
        ? normalizeOpenRouterModelsUrl(config.modelsUrl)
        : normalizeBaseUrl(config.modelsUrl);
    return {
        ...config,
        provider,
        baseUrl,
        modelsUrl: modelsUrl || undefined,
        apiKey: normalizeApiKey(config.apiKey),
        model: String(config.model || '').trim() || (provider === 'openrouter' ? OPENROUTER_EMBEDDING_MODEL : 'BAAI/bge-m3'),
        dimensions: Number.isFinite(Number(config.dimensions)) ? Number(config.dimensions) : 1024,
    };
}

export function getEmbeddingUrl(config: EmbeddingConfig): string {
    const normalized = normalizeEmbeddingConfig(config);
    const baseUrl = normalized.provider === 'openrouter'
        ? normalizeOpenRouterBaseUrl(normalized.baseUrl)
        : normalizeBaseUrl(normalized.baseUrl);
    return appendEndpoint(baseUrl, 'embeddings');
}

export function getEmbeddingModelsUrl(config: EmbeddingConfig): string {
    const normalized = normalizeEmbeddingConfig(config);
    if (normalized.modelsUrl) return normalized.modelsUrl;
    if (normalized.provider === 'openrouter') return OPENROUTER_EMBEDDING_MODELS_URL;
    const baseUrl = normalizeBaseUrl(normalized.baseUrl);
    if (/\/embeddings$/i.test(baseUrl)) return `${baseUrl}/models`;
    return appendEndpoint(baseUrl, 'models');
}

export function getRerankUrl(config: { provider?: EmbeddingProvider; baseUrl: string }): string {
    const provider = inferEmbeddingProvider(config.provider, config.baseUrl);
    const baseUrl = provider === 'openrouter'
        ? normalizeOpenRouterBaseUrl(config.baseUrl)
        : normalizeBaseUrl(config.baseUrl);
    return appendEndpoint(baseUrl, 'rerank');
}

export function isOpenRouterConfig(config: { provider?: EmbeddingProvider; baseUrl?: string; modelsUrl?: string }, url?: string): boolean {
    return inferEmbeddingProvider(config.provider, config.baseUrl, config.modelsUrl) === 'openrouter' || isOpenRouterHost(url);
}

export function sanitizeSecretText(text: unknown, apiKey?: string): string {
    let output = String(text || '');
    const secret = normalizeApiKey(apiKey);
    if (secret) output = output.split(secret).join('[redacted]');
    return output
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
        .replace(/sk-[A-Za-z0-9_-]{8,}/gi, '[redacted]')
        .slice(0, 600);
}

export function isNetworkFetchError(error: unknown): boolean {
    const message = String((error as any)?.message || error || '');
    return /failed to fetch|networkerror|load failed|cors/i.test(message);
}

export function hasMissingAuthHeader(status: number, text: string): boolean {
    return status === 401 && /missing\s+authentication\s+header|authorization\s+header/i.test(text);
}

export function normalizeModelList(data: any, kind: 'embedding' | 'rerank'): ProviderModelOption[] {
    const source: any[] = Array.isArray(data) ? data
        : Array.isArray(data?.data) ? data.data
        : Array.isArray(data?.models) ? data.models
        : Array.isArray(data?.items) ? data.items
        : [];
    const seen = new Set<string>();
    const priority = (model: ProviderModelOption): number => {
        const haystack = `${model.id} ${model.name} ${model.description || ''} ${model.modality || ''}`.toLowerCase();
        if (kind === 'rerank') {
            if (/rerank|reranker|ranker/.test(haystack)) return 0;
            if (/embedding|embed|vision|image|audio|tts|whisper/.test(haystack)) return 2;
            return 1;
        }
        return /embedding|embed|text-embedding|bge|qwen3.*embed|e5-|gte-|jina/.test(haystack) ? 0 : 1;
    };
    return source
        .map((item: any) => {
            const id = typeof item === 'string'
                ? item
                : String(item?.id || item?.name || item?.canonical_slug || item?.model || item?.slug || '').trim();
            if (!id || seen.has(id)) return null;
            seen.add(id);
            const architecture = item?.architecture && typeof item.architecture === 'object' ? item.architecture : {};
            const modality = architecture.modality || (Array.isArray(architecture.output_modalities) ? architecture.output_modalities.join(',') : item?.modality || '');
            return {
                id,
                name: String(item?.name || item?.display_name || item?.title || id),
                description: String(item?.description || ''),
                contextLength: Number(item?.context_length || item?.contextLength || 0),
                modality: String(modality || ''),
            } as ProviderModelOption;
        })
        .filter((model: ProviderModelOption | null): model is ProviderModelOption => !!model)
        .sort((a: ProviderModelOption, b: ProviderModelOption) => priority(a) - priority(b) || a.id.localeCompare(b.id))
        .slice(0, 200);
}
