import type { EmbeddingConfig } from './types';
import {
    hasMissingAuthHeader,
    isNetworkFetchError,
    isOpenRouterConfig,
    sanitizeSecretText,
} from './providerConfig';

type ProviderFetchConfig = Pick<EmbeddingConfig, 'provider' | 'baseUrl' | 'modelsUrl'>;

type ProviderFetchOptions = {
    url: string;
    apiKey: string;
    label: string;
    config: ProviderFetchConfig;
    method?: 'GET' | 'POST';
    bodyText?: string;
    retries?: number;
};

function canUseSameOriginProxy(): boolean {
    if (typeof window === 'undefined' || !window.location || !/^https?:$/i.test(window.location.protocol)) return false;
    const hostname = window.location.hostname || '';
    return !/^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i.test(hostname);
}

async function parseJsonResponse(response: any, label: string): Promise<any> {
    if (typeof response?.text === 'function') {
        const text = await response.text();
        if (!String(text || '').trim()) throw new Error(`${label} API returned an empty response`);
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`${label} API returned invalid JSON`);
        }
    }
    if (typeof response?.json === 'function') {
        try {
            return await response.json();
        } catch {
            throw new Error(`${label} API returned invalid JSON`);
        }
    }
    throw new Error(`${label} API returned an unreadable response`);
}

async function fetchViaProxy(options: ProviderFetchOptions): Promise<any> {
    if (!canUseSameOriginProxy()) throw new Error(`${options.label} proxy unavailable`);
    const response = await fetch('/api/memory-provider-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            url: options.url,
            method: options.method || 'POST',
            apiKey: options.apiKey,
            bodyText: options.bodyText || '',
        }),
    });
    if (!response.ok) {
        const text = typeof response.text === 'function' ? await response.text().catch(() => '') : '';
        throw new Error(`${options.label} proxy error ${response.status}${text ? `: ${sanitizeSecretText(text, options.apiKey)}` : ''}`);
    }
    return parseJsonResponse(response, `${options.label} proxy`);
}

export async function fetchProviderJson(options: ProviderFetchOptions): Promise<any> {
    const method = options.method || 'POST';
    const retries = Math.max(0, options.retries ?? 1);
    const retryableStatuses = new Set([429, 500, 502, 503, 504]);
    let lastNetworkError: unknown = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        let response: any;
        try {
            response = await fetch(options.url, {
                method,
                headers: {
                    'Accept': 'application/json',
                    ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
                    'Authorization': `Bearer ${options.apiKey}`,
                },
                ...(method === 'POST' ? { body: options.bodyText || '{}' } : {}),
            });
        } catch (error) {
            lastNetworkError = error;
            break;
        }

        if (response.ok) return parseJsonResponse(response, options.label);

        const errorText = typeof response.text === 'function'
            ? sanitizeSecretText(await response.text().catch(() => ''), options.apiKey)
            : '';

        if (
            hasMissingAuthHeader(Number(response.status), errorText)
            && isOpenRouterConfig(options.config, options.url)
            && canUseSameOriginProxy()
        ) {
            return fetchViaProxy({ ...options, method });
        }

        if (retryableStatuses.has(Number(response.status)) && attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
            continue;
        }

        throw new Error(`${options.label} API error ${response.status}${errorText ? `: ${errorText}` : ''}`);
    }

    if (lastNetworkError && isNetworkFetchError(lastNetworkError) && canUseSameOriginProxy()) {
        try {
            return await fetchViaProxy({ ...options, method });
        } catch {
            throw lastNetworkError;
        }
    }

    throw lastNetworkError instanceof Error ? lastNetworkError : new Error(`${options.label} API request failed`);
}
