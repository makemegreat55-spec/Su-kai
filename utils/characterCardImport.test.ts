import { describe, expect, it } from 'vitest';
import { importCharacterCardJson, importCharacterCardPng } from './characterCardImport';

const idFactory = (() => {
    let i = 0;
    return (kind: 'char' | 'worldbook') => `${kind}-test-${++i}`;
})();

const encodeBase64Utf8 = (text: string): string => {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
};

const chunk = (type: string, data = new Uint8Array()): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const len = data.length;
    out[0] = (len >>> 24) & 0xff;
    out[1] = (len >>> 16) & 0xff;
    out[2] = (len >>> 8) & 0xff;
    out[3] = len & 0xff;
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    return out;
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
};

const makePng = (chunks: Uint8Array[]): Uint8Array =>
    concat(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        ...chunks,
        chunk('IEND'),
    );

const textChunk = (keyword: string, value: string): Uint8Array => {
    const key = new TextEncoder().encode(keyword);
    const text = new TextEncoder().encode(value);
    const data = new Uint8Array(key.length + 1 + text.length);
    data.set(key, 0);
    data[key.length] = 0;
    data.set(text, key.length + 1);
    return chunk('tEXt', data);
};

const zTextChunk = (keyword: string): Uint8Array => {
    const key = new TextEncoder().encode(keyword);
    const data = new Uint8Array(key.length + 2);
    data.set(key, 0);
    data[key.length] = 0;
    data[key.length + 1] = 0;
    return chunk('zTXt', data);
};

describe('character card import', () => {
    it('keeps Su-kai character card JSON compatible', () => {
        const result = importCharacterCardJson(JSON.stringify({
            version: 1,
            type: 'sully_character_card',
            name: 'Su',
            avatar: 'data:image/png;base64,avatar',
            description: 'local card',
            systemPrompt: 'stay close',
            mountedWorldbooks: [{ id: 'wb-1', title: 'Book', content: 'Lore' }],
            embeddedTheme: { id: 'theme-1', name: 'Theme' },
        }), { now: 10, idFactory });

        expect(result.sourceFormat).toBe('sully');
        expect(result.character.name).toBe('Su');
        expect(result.character.memories).toEqual([]);
        expect(result.character.mountedWorldbooks?.[0].title).toBe('Book');
        expect(result.character.importedCardMeta).toMatchObject({ sourceFormat: 'sully', importedAt: 10 });
        expect(result.embeddedTheme).toMatchObject({ id: 'theme-1' });
    });

    it('adapts SillyTavern v2 JSON into CharacterProfile fields', () => {
        const result = importCharacterCardJson(JSON.stringify({
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name: 'Mika',
                description: 'A soft-spoken friend from the rainy city.',
                personality: 'gentle but stubborn',
                scenario: 'The city is always raining.',
                first_mes: 'You came back late again.',
                mes_example: '<START>\n{{char}}: I waited.',
                system_prompt: 'Stay in character.',
                post_history_instructions: 'Keep replies intimate.',
                creator_notes: 'Imported for Su-kai.',
                tags: ['rain', 'friend'],
                character_book: {
                    name: 'Mika Book',
                    entries: [
                        { keys: ['rain'], secondary_keys: ['window'], content: 'Rain makes Mika quieter.' },
                    ],
                },
            },
        }), { now: 20, idFactory, sourceFileName: 'mika.json' });

        expect(result.sourceFormat).toBe('sillytavern-v2');
        expect(result.character.name).toBe('Mika');
        expect(result.character.worldview).toBe('The city is always raining.');
        expect(result.character.systemPrompt).toContain('## 人格');
        expect(result.character.systemPrompt).toContain('## 开场白');
        expect(result.character.systemPrompt).toContain('You came back late again.');
        expect(result.character.importedCardMeta?.firstMessage).toBe('You came back late again.');
        expect(result.character.importedCardMeta?.tags).toEqual(['rain', 'friend']);
        expect(result.character.mountedWorldbooks?.[0]).toMatchObject({
            title: 'Mika Book',
            category: 'Mika 的角色卡',
        });
        expect(result.character.mountedWorldbooks?.[0].content).toContain('触发词: rain');
    });

    it('adapts TavernAI v1 top-level JSON', () => {
        const result = importCharacterCardJson(JSON.stringify({
            name: 'Ren',
            description: 'A bright rival.',
            personality: 'competitive',
            scenario: 'A tiny shared apartment.',
            first_mes: 'Morning.',
        }), { now: 30, idFactory });

        expect(result.sourceFormat).toBe('tavernai-v1');
        expect(result.character.name).toBe('Ren');
        expect(result.character.description).toBe('A bright rival.');
        expect(result.character.systemPrompt).toContain('competitive');
        expect(result.character.importedCardMeta?.firstMessage).toBe('Morning.');
    });

    it('extracts PNG tEXt chara metadata and uses PNG avatar data', () => {
        const card = {
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: { name: 'Png Girl', personality: 'quiet' },
        };
        const png = makePng([textChunk('chara', encodeBase64Utf8(JSON.stringify(card)))]);
        const result = importCharacterCardPng(png, {
            now: 40,
            idFactory,
            sourceFileName: 'png-girl.png',
            pngAvatarDataUrl: 'data:image/png;base64,avatar',
        });

        expect(result.sourceFormat).toBe('sillytavern-v2');
        expect(result.character.name).toBe('Png Girl');
        expect(result.character.avatar).toBe('data:image/png;base64,avatar');
    });

    it('fails safely for invalid JSON', () => {
        expect(() => importCharacterCardJson('{bad')).toThrow('JSON');
    });

    it('fails safely when PNG has no chara metadata', () => {
        const png = makePng([textChunk('other', 'value')]);
        expect(() => importCharacterCardPng(png)).toThrow('chara');
    });

    it('explains compressed PNG metadata is unsupported', () => {
        const png = makePng([zTextChunk('chara')]);
        expect(() => importCharacterCardPng(png)).toThrow('圧縮形式');
    });
});
