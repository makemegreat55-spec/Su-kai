import { describe, expect, it } from 'vitest';
import {
    extractYuanKaiStatusUpdate,
    extractYuanKaiThoughtUpdate,
    normalizeYuanKaiSpecialOutputForDisplay,
    sanitizeYuanKaiHiddenTagsForDisplay,
} from '.';

describe('yuan-kai prompt sanitize helpers', () => {
    it('strips hidden yuan-kai-only tags before chat display', () => {
        const input = '你好<yk_hidden>不要显示</yk_hidden>[[YUAN_KAI_THOUGHT: secret]]在吗';
        expect(sanitizeYuanKaiHiddenTagsForDisplay(input)).toBe('你好在吗');
    });

    it('normalizes yuan-kai JSON action output into Su-kai display text when it leaks', () => {
        const input = JSON.stringify([
            { type: 'thought_chain', subtext_perception: 'secret' },
            { type: 'text', content: ['第一句', '第二句'] },
            { type: 'quote_reply', target_content: '刚才那句', reply_content: '我听见了' },
            { type: 'sticker', meaning: '笑' },
            { type: 'update_thoughts', heartfelt_voice: 'secret' },
        ]);

        expect(normalizeYuanKaiSpecialOutputForDisplay(input)).toBe([
            '第一句',
            '第二句',
            '[[QUOTE: 刚才那句]]',
            '我听见了',
            '[[SEND_EMOJI: 笑]]',
        ].join('\n'));
    });

    it('leaves normal Su-kai text and tags intact', () => {
        const input = '嗯嗯\n[[SEND_EMOJI: 笑]]';
        expect(normalizeYuanKaiSpecialOutputForDisplay(input)).toBe(input);
    });

    it('extracts yuan-kai status updates and removes the tag from visible text', () => {
        const input = '在的\n[[YUAN_KAI_STATUS: {"type":"update_status","status_text":"ぼんやり返信中","is_busy":false}]]';
        const result = extractYuanKaiStatusUpdate(input);
        expect(result.content).toBe('在的');
        expect(result.status?.statusText).toBe('ぼんやり返信中');
        expect(result.status?.isBusy).toBe(false);
        expect(normalizeYuanKaiSpecialOutputForDisplay(input)).toBe('在的');
    });

    it('extracts yuan-kai hidden thought and keeps only visible text', () => {
        const input = '[[YUAN_KAI_THOUGHT: 返事の前に少し迷っている]]\n表示する返事';
        const result = extractYuanKaiThoughtUpdate(input);
        expect(result.content).toBe('表示する返事');
        expect(result.thought?.thoughtText).toBe('返事の前に少し迷っている');
        expect(normalizeYuanKaiSpecialOutputForDisplay(input)).toBe('表示する返事');
    });

    it('handles thought then visible message then status in the requested order', () => {
        const input = [
            '[[YUAN_KAI_THOUGHT: いまの内心を一文]]',
            '表示する返事',
            '[[YUAN_KAI_STATUS: {"type":"update_status","status_text":"少し考えごと","is_busy":false}]]',
        ].join('\n');

        const thoughtResult = extractYuanKaiThoughtUpdate(input);
        const statusResult = extractYuanKaiStatusUpdate(thoughtResult.content);

        expect(thoughtResult.thought?.thoughtText).toBe('いまの内心を一文');
        expect(statusResult.status?.statusText).toBe('少し考えごと');
        expect(statusResult.status?.isBusy).toBe(false);
        expect(normalizeYuanKaiSpecialOutputForDisplay(input)).toBe('表示する返事');
    });
});
