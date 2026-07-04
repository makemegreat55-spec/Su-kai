import { describe, expect, it } from 'vitest';
import {
  createDefaultPixelLifeState,
  PIXEL_LIFE_DEFAULT_STEP_MS,
  selectPixelLifeEventCandidate,
  shouldPromoteLifeEventToMemory,
  simulatePixelLifeCatchup,
} from '../apps/pixelHome/lifeSim';
import type { PixelLifeEvent } from '../apps/pixelHome/types';

const char = {
  id: 'char-life-test',
  name: '沈泽清',
  description: '喜欢音乐，也会认真处理自己的事。',
  systemPrompt: '',
  worldview: '',
};

const atHour = (hour: number) => new Date(2026, 0, 2, hour, 0, 0).getTime();

const makeRecentEvent = (patch: Partial<PixelLifeEvent>): PixelLifeEvent => ({
  id: 'recent',
  charId: char.id,
  timestamp: atHour(12),
  dayKey: '2026-01-02',
  placeId: 'study',
  actionType: 'work',
  title: '处理自己的事',
  summary: '上一条事件',
  importance: 5,
  createdBy: 'rule',
  ...patch,
});

describe('pixel home life simulation', () => {
  it('朝/昼/夜で違う生活候補を出す', () => {
    const state = createDefaultPixelLifeState(char.id, atHour(8));
    const morning = selectPixelLifeEventCandidate({ char, state, timestamp: atHour(8), rng: () => 0 });
    const day = selectPixelLifeEventCandidate({ char, state, timestamp: atHour(13), rng: () => 0 });
    const night = selectPixelLifeEventCandidate({ char, state, timestamp: atHour(23), rng: () => 0 });

    expect(new Set([morning.title, day.title, night.title]).size).toBe(3);
    expect(morning.actionType).not.toBe(day.actionType);
    expect(day.actionType).not.toBe(night.actionType);
  });

  it('直前と同じイベントを連続選択しにくい', () => {
    const state = createDefaultPixelLifeState(char.id, atHour(13));
    const candidate = selectPixelLifeEventCandidate({
      char,
      state,
      timestamp: atHour(13),
      recentEvents: [makeRecentEvent({})],
      rng: () => 0,
    });

    expect(candidate.title).not.toBe('处理自己的事');
    expect(candidate.actionType === 'work' && candidate.placeId === 'study').toBe(false);
  });

  it('未処理時間が長くても最大生成数を超えない', () => {
    const now = atHour(20);
    const state = {
      ...createDefaultPixelLifeState(char.id, now),
      lastSimulatedAt: now - 24 * PIXEL_LIFE_DEFAULT_STEP_MS,
    };
    const result = simulatePixelLifeCatchup({ char, state, now, maxEvents: 5, rng: () => 0.2 });

    expect(result.events.length).toBe(5);
  });

  it('importance が低いイベントは記憶候補にならない', () => {
    expect(shouldPromoteLifeEventToMemory(6)).toBe(false);

    const now = atHour(13);
    const result = simulatePixelLifeCatchup({
      char,
      state: createDefaultPixelLifeState(char.id, now),
      now,
      rng: () => 0,
    });

    expect(result.events[0].importance).toBeLessThan(7);
    expect(result.events[0].memoryCandidate).toBe(false);
  });

  it('importance が高いイベントは記憶候補になる', () => {
    expect(shouldPromoteLifeEventToMemory(7)).toBe(true);

    const now = atHour(23);
    const state = {
      ...createDefaultPixelLifeState(char.id, now),
      mood: 20,
      lastSimulatedAt: now - PIXEL_LIFE_DEFAULT_STEP_MS,
    };
    const result = simulatePixelLifeCatchup({ char, state, now, rng: () => 0 });

    expect(result.events[0].importance).toBeGreaterThanOrEqual(7);
    expect(result.events[0].memoryCandidate).toBe(true);
  });
});
