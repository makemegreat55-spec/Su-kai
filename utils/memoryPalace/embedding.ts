/**
 * Memory Palace — Embedding 服务
 *
 * 调用 Embedding API，将文本转为向量。
 * 支持硅基流动 / 阿里云 / 字节等 OpenAI-compatible 端点，以及 OpenRouter。
 */

import type { EmbeddingConfig } from './types';
import { fetchProviderJson } from './providerFetch';
import {
    getEmbeddingModelsUrl,
    getEmbeddingUrl,
    isNetworkFetchError,
    normalizeApiKey,
    normalizeEmbeddingConfig,
    normalizeModelList,
    OPENROUTER_EMBEDDING_MODELS,
    type ProviderModelOption,
} from './providerConfig';

// ─── 核心 API 调用 ────────────────────────────────────

/**
 * 单条文本向量化 — 返回 Float32Array 节省内存
 */
export async function getEmbedding(text: string, config: EmbeddingConfig): Promise<Float32Array> {
    const results = await getEmbeddings([text], config);
    return results[0];
}

/**
 * 批量文本向量化（一次最多 10 条，超出自动分批）
 * 返回 Float32Array[] — 比 number[][] 节省约 50% 内存
 */
export async function getEmbeddings(texts: string[], config: EmbeddingConfig): Promise<Float32Array[]> {
    if (texts.length === 0) return [];

    // DashScope（Qwen 官端）的 text-embedding-v3/v4、Qwen3-Embedding 单次 batch
    // 硬上限是 10 条，超过直接 400 InvalidParameter。取 10 作为通用安全值：
    // 硅基流动等 bge 系列用 10 也照常工作，纯按 token 计费不受影响。
    const BATCH_SIZE = 10;
    // 多批并行发送，避免拆批后变成串行多往返拖慢检索（尤其硅基用户本来一次
    // 就发完）。但限制并发数，防止「重建全部记忆」(上百批) 一次性轰出去触发
    // 服务商限流 / 429。检索通常就 1~2 批 → 全并行 ≈ 1 个往返。
    const MAX_CONCURRENCY = 5;

    // 先按顺序切成 ≤BATCH_SIZE 的块（顺序很重要：调用方按下标取向量）
    const chunks: string[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        chunks.push(texts.slice(i, i + BATCH_SIZE));
    }

    const results: Float32Array[] = [];
    // 每次并行跑 MAX_CONCURRENCY 个块；块间顺序、块内顺序都严格保持
    for (let i = 0; i < chunks.length; i += MAX_CONCURRENCY) {
        const window = chunks.slice(i, i + MAX_CONCURRENCY);
        const windowResults = await Promise.all(
            window.map(chunk => callEmbeddingAPI(chunk, config)),
        );
        // Promise.all 保序：windowResults[j] 对应 window[j]，按序展开
        for (const batchResult of windowResults) {
            results.push(...batchResult.map(v => new Float32Array(v)));
        }
    }

    return results;
}

/**
 * 该模型是否支持自定义 `dimensions` 参数。
 *
 * 硅基流动文档明确：`dimensions` 仅 Qwen/Qwen3-Embedding 系列支持。
 * bge 系列（bge-m3、bge-large 等）输出维度固定，传入 `dimensions` 会被
 * 服务端拒绝（2026-06 起返回 500）。这里只给支持的模型带上该参数。
 */
function modelSupportsDimensions(model: string): boolean {
    return /qwen3?-?embedding|text-embedding-3/i.test(model);
}

/**
 * 实际调用 Embedding API
 */
async function callEmbeddingAPI(
    input: string[], config: EmbeddingConfig, retryCount: number = 0
): Promise<number[][]> {
    const normalized = normalizeEmbeddingConfig(config);
    const url = getEmbeddingUrl(normalized);

    const body: Record<string, unknown> = {
        model: normalized.model,
        input,
        encoding_format: 'float',
    };
    // 仅在模型支持时才发送 dimensions，否则 bge 等固定维度模型会报 500
    if (modelSupportsDimensions(normalized.model) && normalized.dimensions) {
        body.dimensions = normalized.dimensions;
    }

    try {
        const data = await fetchProviderJson({
            url,
            apiKey: normalized.apiKey,
            label: 'Embedding',
            config: normalized,
            method: 'POST',
            bodyText: JSON.stringify(body),
            retries: 0,
        });

        if (!data.data || !Array.isArray(data.data)) {
            throw new Error(`Embedding API returned unexpected format: ${JSON.stringify(data).slice(0, 200)}`);
        }

        // OpenAI 格式: data[].embedding[]
        // 按 index 排序确保顺序正确
        const sorted = [...data.data].sort((a: any, b: any) => a.index - b.index);
        const vectors = sorted.map((item: any) => item.embedding as number[]);
        if (
            vectors.length !== input.length
            || vectors.some(vector => !Array.isArray(vector) || vector.length === 0 || vector.some(value => typeof value !== 'number'))
        ) {
            throw new Error('Embedding API returned invalid vector shape');
        }
        return vectors;

    } catch (err: any) {
        // 重试一次
        if (retryCount < 1) {
            await new Promise(r => setTimeout(r, 1000));
            return callEmbeddingAPI(input, config, retryCount + 1);
        }
        throw err;
    }
}

export async function fetchEmbeddingModels(config: EmbeddingConfig): Promise<{
    provider: EmbeddingConfig['provider'];
    url: string;
    models: ProviderModelOption[];
    fallback: boolean;
}> {
    const normalized = normalizeEmbeddingConfig({
        ...config,
        apiKey: normalizeApiKey(config.apiKey),
    });
    const url = getEmbeddingModelsUrl(normalized);
    if (!normalized.apiKey) throw new Error('Embedding model list API is missing an API key');

    try {
        const data = await fetchProviderJson({
            url,
            apiKey: normalized.apiKey,
            label: 'Embedding model list',
            config: normalized,
            method: 'GET',
            retries: 0,
        });
        const models = normalizeModelList(data, 'embedding');
        if (models.length === 0) throw new Error('Embedding model list returned no usable models');
        return { provider: normalized.provider, url, models, fallback: false };
    } catch (error: any) {
        const message = String(error?.message || error || '');
        if (normalized.provider === 'openrouter' && (isNetworkFetchError(error) || /proxy unavailable|cors/i.test(message))) {
            return {
                provider: 'openrouter',
                url,
                models: OPENROUTER_EMBEDDING_MODELS,
                fallback: true,
            };
        }
        throw error;
    }
}

// ─── 数学工具 ──────────────────────────────────────────

/**
 * 余弦相似度（Float32Array 优化版）
 *
 * 支持 number[] 和 Float32Array 混合输入。
 * 使用 Float32Array 时内存访问连续，V8 可以利用 SIMD 加速，
 * 在 1024 维向量上比普通 number[] 快 3-5x。
 *
 * 返回值范围 [-1, 1]，越接近 1 越相似
 */
export function cosineSimilarity(
    a: number[] | Float32Array,
    b: number[] | Float32Array,
): number {
    const len = a.length;
    if (len !== b.length) {
        throw new Error(`Vector dimension mismatch: ${len} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    // 4x 循环展开 — 减少分支预测开销，配合连续内存布局显著提速
    const limit = len - (len % 4);
    let i = 0;
    for (; i < limit; i += 4) {
        const a0 = a[i], a1 = a[i+1], a2 = a[i+2], a3 = a[i+3];
        const b0 = b[i], b1 = b[i+1], b2 = b[i+2], b3 = b[i+3];
        dotProduct += a0*b0 + a1*b1 + a2*b2 + a3*b3;
        normA += a0*a0 + a1*a1 + a2*a2 + a3*a3;
        normB += b0*b0 + b1*b1 + b2*b2 + b3*b3;
    }
    // 处理余数
    for (; i < len; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
}
