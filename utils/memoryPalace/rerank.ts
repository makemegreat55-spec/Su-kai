/**
 * Memory Palace — Rerank（cross-encoder 二次排序）
 *
 * 通用 /rerank 协议，兼容 SiliconFlow / Jina / Cohere / Voyage / OpenRouter：
 *   POST {baseUrl}/rerank
 *   {
 *     "model": "BAAI/bge-reranker-v2-m3",
 *     "query": "...",
 *     "documents": ["text1", "text2", ...],
 *     "top_n": 5,
 *     "return_documents": false
 *   }
 *   → { "results": [{ "index": 3, "relevance_score": 0.95 }, ...] }
 *
 * 用途：主召回给 LLM 的是"embedding 找的最像 + 启发式加权"的 top 15，
 *      rerank 用 cross-encoder 直接理解 (query, doc) 对的语义相关性，
 *      把 LLM 回合里用户真正在问的焦点记忆额外推上来几条。
 *
 * 主召回和 rerank 的候选池不共享：pipeline 用 joined userIntent 单独
 * 再跑一次 hybridSearch 作为 rerank 输入池（这一轮 user 发言对应的语义空间）。
 */

import type { EmbeddingProvider } from './types';
import { fetchProviderJson } from './providerFetch';
import {
    getRerankUrl,
    inferEmbeddingProvider,
    normalizeApiKey,
    OPENROUTER_RERANK_MODEL,
    OPENROUTER_RERANK_MODELS,
    type ProviderModelOption,
} from './providerConfig';

export interface RerankApiConfig {
    provider?: EmbeddingProvider;
    baseUrl: string;
    apiKey: string;
    model: string;
    modelsUrl?: string;
}

export interface RerankResult {
    /** 对应输入 documents[] 的下标 */
    index: number;
    /** 模型给出的相关性分数，通常 0-1，但不同模型 scale 不同，只用于排序 */
    relevance_score: number;
}

/**
 * 调用 rerank API，返回 top N 的 (index, score) 列表。
 *
 * 失败会 throw，让调用方决定是否 warn 或降级。一般失败原因：
 *   - API key 无效 / 余额不足
 *   - baseUrl 写错或网络不通（和 embedding 共用服务商时往往一起挂）
 *   - 模型名错（SiliconFlow 大小写敏感，"BAAI/bge-reranker-v2-m3"）
 */
export async function rerankDocuments(
    config: RerankApiConfig,
    query: string,
    documents: string[],
    topN: number,
): Promise<RerankResult[]> {
    if (documents.length === 0 || !query.trim()) return [];

    const provider = inferEmbeddingProvider(config.provider, config.baseUrl, config.modelsUrl);
    const normalized: RerankApiConfig = {
        ...config,
        provider,
        apiKey: normalizeApiKey(config.apiKey),
        model: config.model?.trim() || (provider === 'openrouter' ? OPENROUTER_RERANK_MODEL : 'BAAI/bge-reranker-v2-m3'),
    };
    const url = getRerankUrl(normalized);
    const body: Record<string, unknown> = {
        model: normalized.model,
        query,
        documents,
        top_n: Math.min(topN, documents.length),
    };
    if (normalized.provider !== 'openrouter') body.return_documents = false;

    const data = await fetchProviderJson({
        url,
        apiKey: normalized.apiKey,
        label: 'Rerank',
        config: normalized,
        method: 'POST',
        bodyText: JSON.stringify(body),
        retries: 1,
    });

    // 兼容两种返回形态：
    //   - Cohere/SiliconFlow/Jina 新版: { results: [{index, relevance_score}] }
    //   - 少数旧版可能写成 { data: [...] }
    const rows: any[] = Array.isArray(data?.results) ? data.results
                     : Array.isArray(data?.data)    ? data.data
                     : [];

    return rows
        .filter(r => typeof r?.index === 'number')
        .map(r => ({
            index: r.index,
            relevance_score: typeof r.relevance_score === 'number' ? r.relevance_score
                          : typeof r.score === 'number'            ? r.score
                          : 0,
        }));
}

export async function fetchRerankModels(config: RerankApiConfig): Promise<{
    provider: EmbeddingProvider | undefined;
    url: string;
    models: ProviderModelOption[];
    builtin: boolean;
}> {
    const provider = inferEmbeddingProvider(config.provider, config.baseUrl, config.modelsUrl);
    if (provider === 'openrouter') {
        return {
            provider: 'openrouter',
            url: getRerankUrl({ provider: 'openrouter', baseUrl: config.baseUrl }),
            models: OPENROUTER_RERANK_MODELS,
            builtin: true,
        };
    }
    return {
        provider,
        url: getRerankUrl(config),
        models: [
            { id: 'BAAI/bge-reranker-v2-m3', name: 'BGE Reranker v2 M3', modality: 'rerank' },
            { id: 'Pro/BAAI/bge-reranker-v2-m3', name: 'BGE Reranker v2 M3 Pro', modality: 'rerank' },
            { id: 'netease-youdao/bce-reranker-base_v1', name: 'BCE Reranker Base', modality: 'rerank' },
        ],
        builtin: true,
    };
}
