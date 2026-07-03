import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { CharacterProfile, Message } from '../../types';
import {
    normalizeIllustrationHint,
    parseNovelAiImageResponse,
    parseNovelAiSseImage,
    selectIllustrationCandidate,
    stripBearerPrefix,
} from '.';

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const char = {
    id: 'char-1',
    name: 'Sully',
    avatar: '',
    description: '',
    systemPrompt: '',
} as CharacterProfile;

const makeMessages = (count: number): Message[] =>
    Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        charId: 'char-1',
        role: index % 2 === 0 ? 'user' : 'assistant',
        type: 'text',
        content: `message ${index + 1}`,
        timestamp: index + 1,
    }));

const goodHint = () => normalizeIllustrationHint({
    trigger: true,
    intent: 'visual_moment',
    title: 'Rainy window',
    momentText: 'She stands near the rainy window and looks down at the glowing phone with a small smile.',
    sourceText: 'She stands near the rainy window and looks down at the glowing phone with a small smile.',
    imagePrompt: 'one character near a rainy bedroom window holding a glowing phone, upper body composition',
    importance: 92,
    subject: 'one character',
    expression: 'small relieved smile',
    pose: 'holding a phone near the chest',
    clothing: 'soft cardigan',
    scene: 'rainy bedroom window at night',
    camera: 'upper body, three quarter view',
    mood: 'quiet and tender',
});

describe('auto illustration candidate selection', () => {
    it('normalizes pasted Authorization/Bearer key prefixes', () => {
        expect(stripBearerPrefix('Bearer nai-key')).toBe('nai-key');
        expect(stripBearerPrefix('Authorization: Bearer nai-key')).toBe('nai-key');
    });

    it('drops short moments and generic prompts', () => {
        expect(normalizeIllustrationHint({
            trigger: true,
            momentText: 'short',
            imagePrompt: 'anime girl',
            importance: 99,
        })).toBeNull();

        const hint = normalizeIllustrationHint({
            trigger: true,
            momentText: 'She looks at the rain from the window and finally smiles softly.',
            imagePrompt: 'one character near a rainy window, nsfw explicit pose',
            importance: 99,
        });
        const selected = selectIllustrationCandidate({
            hint,
            char,
            contextMsgs: makeMessages(10),
            normalizedContent: 'She looks at the rain from the window and finally smiles softly.',
            state: { visualMomentum: 100, lastTurnIndex: 0, lastGeneratedAt: 0 },
            now: 100_000,
        });
        expect(selected.candidate).toBeNull();
        expect(selected.reason).toBe('prompt-rejected');
    });

    it('selects important visual hints and then gates by turn cooldown', () => {
        const first = selectIllustrationCandidate({
            hint: goodHint(),
            char,
            contextMsgs: makeMessages(10),
            normalizedContent: 'She stands near the rainy window and looks down at the glowing phone with a small smile.',
            state: { visualMomentum: 70, lastTurnIndex: 0, lastGeneratedAt: 0 },
            now: 100_000,
        });
        expect(first.candidate?.importance).toBeGreaterThanOrEqual(88);
        expect(first.reason).toBe('selected');

        const second = selectIllustrationCandidate({
            hint: goodHint(),
            char,
            contextMsgs: makeMessages(12),
            normalizedContent: 'Another beautiful but too-soon moment near the same window.',
            state: first.nextState,
            now: 200_000,
        });
        expect(second.candidate).toBeNull();
        expect(second.reason).toBe('turn-cooldown');
    });

    it('gates by time cooldown even after enough turns', () => {
        const selected = selectIllustrationCandidate({
            hint: goodHint(),
            char,
            contextMsgs: makeMessages(20),
            normalizedContent: 'She stands near the rainy window and looks down at the glowing phone with a small smile.',
            state: { visualMomentum: 90, lastTurnIndex: 8, lastGeneratedAt: 100_000 },
            now: 120_000,
        });
        expect(selected.candidate).toBeNull();
        expect(selected.reason).toBe('time-cooldown');
    });
});

describe('NovelAI response normalization', () => {
    it('normalizes v4 SSE final image payloads into data URLs', () => {
        const parsed = parseNovelAiSseImage(`event: message\ndata: {"event_type":"final","image":"${pngBase64}"}\n\n`);
        expect(parsed.imageDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('normalizes legacy ZIP image payloads into data URLs', async () => {
        const zip = new JSZip();
        zip.file('image.png', pngBase64, { base64: true });
        const blob = await zip.generateAsync({ type: 'blob' });
        const response = new Response(blob, { headers: { 'content-type': 'application/zip' } });

        await expect(parseNovelAiImageResponse(response)).resolves.toMatch(/^data:image\/png;base64,/);
    });
});
