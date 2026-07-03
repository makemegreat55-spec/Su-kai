import type { CharacterProfile, ChatTheme } from '../types';

export type CharacterCardSourceFormat = 'sully' | 'sillytavern-v2' | 'tavernai-v1';

export type CharacterCardImportResult = {
    character: CharacterProfile;
    sourceFormat: CharacterCardSourceFormat;
    embeddedTheme?: ChatTheme;
};

type ImportOptions = {
    sourceFileName?: string;
    pngAvatarDataUrl?: string;
    now?: number;
    idFactory?: (kind: 'char' | 'worldbook') => string;
};

type PngTextChunk = {
    keyword: string;
    text: string;
    compressed?: boolean;
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const utf8 = new TextDecoder('utf-8');

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const textList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map(v => text(v)).filter(Boolean);
};

const firstText = (...values: unknown[]): string => {
    for (const value of values) {
        const s = text(value);
        if (s) return s;
    }
    return '';
};

const shorten = (value: string, limit: number): string => {
    const cleaned = value.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= limit) return cleaned;
    return `${cleaned.slice(0, limit - 1)}…`;
};

const fallbackAvatar = (seed: string): string => {
    const colors = ['FF9AA2', 'FFB7B2', 'FFDAC1', 'E2F0CB', 'B5EAD7', 'C7CEEA', 'e2e8f0', 'fcd34d', 'fca5a5'];
    const first = seed.trim().charAt(0) || '?';
    const color = colors[first.charCodeAt(0) % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#${color}"/><text x="50" y="55" font-family="sans-serif" font-weight="bold" font-size="50" text-anchor="middle" dy=".3em" fill="white" opacity="0.9">${first.toUpperCase()}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const defaultIdFactory = (kind: 'char' | 'worldbook'): string =>
    `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const isObject = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

const parseJson = (raw: string): unknown => {
    try {
        return JSON.parse(raw.replace(/^\uFEFF/, '').trim());
    } catch {
        throw new Error('角色卡 JSON 解析失败');
    }
};

const decodeBase64Utf8 = (raw: string): string => {
    const cleaned = raw.trim().replace(/^data:[^,]+,/, '').replace(/\s+/g, '');
    if (!cleaned) throw new Error('PNG chara メタデータが空です');
    if (typeof globalThis.atob !== 'function') {
        throw new Error('この環境では base64 解析が利用できません');
    }
    try {
        const binary = globalThis.atob(cleaned);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return utf8.decode(bytes);
    } catch {
        throw new Error('PNG chara メタデータの base64 解析に失敗しました');
    }
};

const ascii = (bytes: Uint8Array, start = 0, end = bytes.length): string => {
    let out = '';
    for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
    return out;
};

const readUint32 = (bytes: Uint8Array, offset: number): number =>
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;

const findNull = (bytes: Uint8Array, start = 0): number => {
    for (let i = start; i < bytes.length; i++) {
        if (bytes[i] === 0) return i;
    }
    return -1;
};

const parseTextChunk = (data: Uint8Array): PngTextChunk | null => {
    const sep = findNull(data);
    if (sep <= 0) return null;
    return {
        keyword: ascii(data, 0, sep),
        text: ascii(data, sep + 1),
    };
};

const parseITextChunk = (data: Uint8Array): PngTextChunk | null => {
    const keywordEnd = findNull(data);
    if (keywordEnd <= 0 || keywordEnd + 2 >= data.length) return null;

    const keyword = ascii(data, 0, keywordEnd);
    const compressionFlag = data[keywordEnd + 1];
    let cursor = keywordEnd + 3;
    const languageEnd = findNull(data, cursor);
    if (languageEnd < 0) return null;
    cursor = languageEnd + 1;
    const translatedEnd = findNull(data, cursor);
    if (translatedEnd < 0) return null;
    cursor = translatedEnd + 1;

    if (compressionFlag !== 0) {
        return { keyword, text: '', compressed: true };
    }

    return { keyword, text: utf8.decode(data.slice(cursor)) };
};

const parseZTextChunk = (data: Uint8Array): PngTextChunk | null => {
    const sep = findNull(data);
    if (sep <= 0) return null;
    return { keyword: ascii(data, 0, sep), text: '', compressed: true };
};

export const extractCharaMetadataFromPng = (bytes: Uint8Array): string => {
    if (bytes.length < 16 || PNG_SIGNATURE.some((b, i) => bytes[i] !== b)) {
        throw new Error('PNGファイルではありません');
    }

    let offset = 8;
    let foundCompressedChara = false;

    while (offset + 12 <= bytes.length) {
        const length = readUint32(bytes, offset);
        const type = ascii(bytes, offset + 4, offset + 8);
        const dataStart = offset + 8;
        const dataEnd = dataStart + length;
        if (dataEnd + 4 > bytes.length) throw new Error('PNGメタデータが壊れています');

        const chunkData = bytes.slice(dataStart, dataEnd);
        const parsed =
            type === 'tEXt' ? parseTextChunk(chunkData)
                : type === 'iTXt' ? parseITextChunk(chunkData)
                    : type === 'zTXt' ? parseZTextChunk(chunkData)
                        : null;

        if (parsed?.keyword === 'chara') {
            if (parsed.compressed) foundCompressedChara = true;
            else if (parsed.text.trim()) return parsed.text.trim();
        }

        offset = dataEnd + 4;
        if (type === 'IEND') break;
    }

    if (foundCompressedChara) {
        throw new Error('PNG内のcharaメタデータは圧縮形式です。v1では tEXt または非圧縮 iTXt のカードに対応しています');
    }
    throw new Error('PNG内にcharaメタデータが見つかりません');
};

const detectFormat = (raw: unknown): { format: CharacterCardSourceFormat; payload: Record<string, unknown> } => {
    if (!isObject(raw)) throw new Error('角色卡结构错误');

    if (raw.type === 'sully_character_card') {
        return { format: 'sully', payload: raw };
    }

    if (isObject(raw.data) && (typeof raw.spec === 'string' || raw.spec_version !== undefined)) {
        return { format: 'sillytavern-v2', payload: raw.data };
    }

    const tavernSignals = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example'];
    if (tavernSignals.some(key => raw[key] !== undefined)) {
        return { format: 'tavernai-v1', payload: raw };
    }

    throw new Error('対応していない角色卡形式です');
};

const addSection = (sections: { title: string; content: string }[], seen: Set<string>, title: string, content: string) => {
    const cleaned = content.trim();
    if (!cleaned) return;
    const key = cleaned.replace(/\s+/g, ' ');
    if (seen.has(key)) return;
    seen.add(key);
    sections.push({ title, content: cleaned });
};

const buildSystemPrompt = (payload: Record<string, unknown>): string => {
    const sections: { title: string; content: string }[] = [];
    const seen = new Set<string>();

    addSection(sections, seen, '人格', firstText(payload.personality));
    addSection(sections, seen, '系统提示', firstText(payload.system_prompt, isObject(payload.extensions) ? payload.extensions.system_prompt : ''));
    addSection(sections, seen, '后置指令', firstText(payload.post_history_instructions));
    addSection(sections, seen, '开场白', firstText(payload.first_mes));
    addSection(sections, seen, '对话示例', firstText(payload.mes_example));
    addSection(sections, seen, '创作者备注', firstText(payload.creator_notes));

    return sections.map(section => `## ${section.title}\n${section.content}`).join('\n\n');
};

const entryList = (entries: unknown): Record<string, unknown>[] => {
    if (Array.isArray(entries)) return entries.filter(isObject);
    if (isObject(entries)) return Object.values(entries).filter(isObject);
    return [];
};

const buildWorldbook = (
    payload: Record<string, unknown>,
    charName: string,
    idFactory: NonNullable<ImportOptions['idFactory']>,
): CharacterProfile['mountedWorldbooks'] => {
    const book = isObject(payload.character_book) ? payload.character_book : undefined;
    if (!book) return [];

    const entries = entryList(book.entries).filter(entry => entry.enabled !== false);
    const blocks: string[] = [];
    const title = firstText(book.name, `${charName} 角色书`);

    for (const entry of entries) {
        const content = firstText(entry.content);
        if (!content) continue;
        const keys = textList(entry.keys);
        const secondaryKeys = textList(entry.secondary_keys);
        const entryTitle = firstText(entry.name, entry.comment, keys.join(', '), '未命名条目');
        const meta = [
            keys.length ? `触发词: ${keys.join(', ')}` : '',
            secondaryKeys.length ? `辅助触发词: ${secondaryKeys.join(', ')}` : '',
        ].filter(Boolean);
        blocks.push(`## ${entryTitle}\n${meta.length ? `${meta.join('\n')}\n` : ''}${content}`);
    }

    if (blocks.length === 0) return [];

    return [{
        id: idFactory('worldbook'),
        title,
        category: `${charName} 的角色卡`,
        content: `# ${title}\n\n${blocks.join('\n\n')}`,
    }];
};

const normalizeTags = (payload: Record<string, unknown>): string[] | undefined => {
    const tags = textList(payload.tags);
    return tags.length ? tags : undefined;
};

const adaptSullyCard = (
    payload: Record<string, unknown>,
    options: Required<Pick<ImportOptions, 'now' | 'idFactory'>> & Pick<ImportOptions, 'sourceFileName'>,
): CharacterCardImportResult => {
    const { version, type, embeddedTheme, ...cardProps } = payload as Record<string, unknown> & { embeddedTheme?: ChatTheme };
    const name = firstText(cardProps.name, 'Imported Character');
    const character = {
        ...cardProps,
        id: options.idFactory('char'),
        name,
        avatar: firstText(cardProps.avatar) || fallbackAvatar(name),
        description: firstText(cardProps.description),
        systemPrompt: firstText(cardProps.systemPrompt),
        memories: [],
        refinedMemories: {},
        activeMemoryMonths: [],
        importedCardMeta: {
            sourceFormat: 'sully' as const,
            sourceFileName: options.sourceFileName,
            importedAt: options.now,
        },
    } as CharacterProfile;

    return { character, sourceFormat: 'sully', embeddedTheme };
};

const adaptTavernCard = (
    format: Exclude<CharacterCardSourceFormat, 'sully'>,
    payload: Record<string, unknown>,
    options: Required<Pick<ImportOptions, 'now' | 'idFactory'>> & Pick<ImportOptions, 'sourceFileName' | 'pngAvatarDataUrl'>,
): CharacterCardImportResult => {
    const name = firstText(payload.name, options.sourceFileName?.replace(/\.(json|png)$/i, ''), 'Imported Character');
    const description = firstText(payload.description);
    const avatarCandidate = firstText(payload.avatar);
    const avatar = options.pngAvatarDataUrl
        || (/^(data:image\/|https?:\/\/)/i.test(avatarCandidate) ? avatarCandidate : '')
        || fallbackAvatar(name);

    const firstMessage = firstText(payload.first_mes);
    const tags = normalizeTags(payload);
    const character: CharacterProfile = {
        id: options.idFactory('char'),
        name,
        avatar,
        description: shorten(description || firstText(payload.personality, payload.scenario), 280),
        systemPrompt: buildSystemPrompt(payload),
        worldview: firstText(payload.scenario) || undefined,
        memories: [],
        refinedMemories: {},
        activeMemoryMonths: [],
        mountedWorldbooks: buildWorldbook(payload, name, options.idFactory),
        contextLimit: 500,
        emotionConfig: { enabled: true },
        importedCardMeta: {
            sourceFormat: format,
            sourceFileName: options.sourceFileName,
            importedAt: options.now,
            firstMessage: firstMessage || undefined,
            tags,
        },
    };

    return { character, sourceFormat: format };
};

export const importCharacterCardJson = (raw: string, options: ImportOptions = {}): CharacterCardImportResult => {
    const parsed = parseJson(raw);
    const detected = detectFormat(parsed);
    const normalizedOptions = {
        now: options.now ?? Date.now(),
        idFactory: options.idFactory ?? defaultIdFactory,
        sourceFileName: options.sourceFileName,
        pngAvatarDataUrl: options.pngAvatarDataUrl,
    };

    if (detected.format === 'sully') {
        return adaptSullyCard(detected.payload, normalizedOptions);
    }
    return adaptTavernCard(detected.format, detected.payload, normalizedOptions);
};

export const importCharacterCardPng = (bytes: Uint8Array, options: ImportOptions = {}): CharacterCardImportResult => {
    const encoded = extractCharaMetadataFromPng(bytes);
    const json = decodeBase64Utf8(encoded);
    return importCharacterCardJson(json, options);
};

export const importCharacterCardFile = async (file: File, options: ImportOptions = {}): Promise<CharacterCardImportResult> => {
    const sourceFileName = options.sourceFileName || file.name;
    if (/\.png$/i.test(file.name) || file.type === 'image/png') {
        const bytes = new Uint8Array(await file.arrayBuffer());
        return importCharacterCardPng(bytes, { ...options, sourceFileName });
    }
    if (/\.json$/i.test(file.name) || file.type === 'application/json' || file.type === '') {
        return importCharacterCardJson(await file.text(), { ...options, sourceFileName });
    }
    throw new Error('対応形式は .json / .png の角色卡です');
};
