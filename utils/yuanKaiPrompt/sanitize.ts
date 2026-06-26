const stripWholeCodeFence = (value: string): string => {
    const trimmed = value.trim();
    const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1].trim() : trimmed;
};

export interface YuanKaiStatusUpdate {
    statusText: string;
    isBusy: boolean;
    updatedAt: number;
}

export interface YuanKaiThoughtUpdate {
    thoughtText: string;
    updatedAt: number;
}

const normalizeStatusText = (value: unknown): string =>
    String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 32);

const normalizeThoughtText = (value: unknown): string =>
    String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);

export function extractYuanKaiThoughtUpdate(text: string): { content: string; thought: YuanKaiThoughtUpdate | null } {
    let latest: YuanKaiThoughtUpdate | null = null;
    const content = String(text || '').replace(/\[\[YUAN_KAI_THOUGHT:\s*([\s\S]*?)\s*\]\]/gi, (_match, rawThought) => {
        const thoughtText = normalizeThoughtText(rawThought);
        if (thoughtText) {
            latest = {
                thoughtText,
                updatedAt: Date.now(),
            };
        }
        return '';
    }).trim();
    return { content, thought: latest };
}

export function extractYuanKaiStatusUpdate(text: string): { content: string; status: YuanKaiStatusUpdate | null } {
    let latest: YuanKaiStatusUpdate | null = null;
    const content = String(text || '').replace(/\[\[YUAN_KAI_STATUS:\s*({[\s\S]*?})\s*\]\]/gi, (_match, jsonText) => {
        try {
            const parsed = JSON.parse(jsonText);
            if (!parsed || parsed.type !== 'update_status') return '';
            const statusText = normalizeStatusText(parsed.status_text ?? parsed.statusText);
            if (!statusText) return '';
            latest = {
                statusText,
                isBusy: parsed.is_busy === true || parsed.isBusy === true,
                updatedAt: Date.now(),
            };
        } catch {
            return '';
        }
        return '';
    }).trim();
    return { content, status: latest };
}

export function sanitizeYuanKaiHiddenTagsForDisplay(text: string): string {
    return String(text || '')
        .replace(/<yk_hidden>[\s\S]*?<\/yk_hidden>/gi, '')
        .replace(/<yuan_kai_hidden>[\s\S]*?<\/yuan_kai_hidden>/gi, '')
        .replace(/\[\[(?:YK|YUAN_KAI)_(?:HIDDEN|THOUGHT|PRIVATE|INTERNAL):[\s\S]*?\]\]/gi, '')
        .replace(/\[\/?(?:yk|yuan_kai)_hidden\]/gi, '')
        .trim();
}

const pushContent = (out: string[], value: unknown): void => {
    if (Array.isArray(value)) {
        value.forEach(item => pushContent(out, item));
        return;
    }
    const text = String(value ?? '').trim();
    if (text) out.push(text);
};

export function normalizeYuanKaiSpecialOutputForDisplay(text: string): string {
    const withoutThought = extractYuanKaiThoughtUpdate(text).content;
    const withoutStatus = extractYuanKaiStatusUpdate(withoutThought).content;
    const sanitized = sanitizeYuanKaiHiddenTagsForDisplay(withoutStatus);
    const candidate = stripWholeCodeFence(sanitized);
    if (!candidate.startsWith('[')) return sanitized;

    let parsed: unknown;
    try {
        parsed = JSON.parse(candidate);
    } catch {
        return sanitized;
    }
    if (!Array.isArray(parsed)) return sanitized;

    const out: string[] = [];
    for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const action = item as Record<string, unknown>;
        const type = String(action.type || '').toLowerCase();
        switch (type) {
            case 'text':
                pushContent(out, action.content ?? action.message ?? action.text);
                break;
            case 'quote_reply': {
                const quoted = String(action.target_content ?? '').trim();
                if (quoted) out.push(`[[QUOTE: ${quoted}]]`);
                pushContent(out, action.reply_content ?? action.content);
                break;
            }
            case 'sticker': {
                const meaning = String(action.meaning ?? action.name ?? '').trim();
                if (meaning) out.push(`[[SEND_EMOJI: ${meaning}]]`);
                break;
            }
            case 'voice_message':
                pushContent(out, action.content ?? action.message);
                break;
            case 'thought_chain':
            case 'update_thoughts':
            case 'create_memory':
                break;
            default:
                break;
        }
    }

    return out.length > 0 ? out.join('\n').trim() : sanitized;
}
