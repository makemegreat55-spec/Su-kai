import type { CharacterProfile } from '../../types';
import { DB } from '../../utils/db';
import type { PixelLifeEvent, PixelLifeState } from './types';
import {
  createDefaultPixelLifeState,
  getPixelLifeDayKey,
  simulatePixelLifeCatchup,
  type SimulatePixelLifeOptions,
} from './lifeSim';

type LifeCharProfile = Pick<CharacterProfile, 'id' | 'name' | 'description' | 'systemPrompt' | 'worldview'>;

const stateKey = (charId: string) => `pixel_home_life_state_${charId}`;
const eventsKey = (charId: string, dayKey: string) => `pixel_home_life_events_${charId}_${dayKey}`;
const MAX_EVENTS_PER_DAY = 80;

const safeJsonParse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const PixelLifeDB = {
  async getState(charId: string): Promise<PixelLifeState | null> {
    return safeJsonParse<PixelLifeState>(await DB.getAsset(stateKey(charId)));
  },

  async saveState(state: PixelLifeState): Promise<void> {
    await DB.saveAsset(stateKey(state.charId), JSON.stringify(state));
  },

  async getEvents(charId: string, dayKey: string = getPixelLifeDayKey()): Promise<PixelLifeEvent[]> {
    const parsed = safeJsonParse<PixelLifeEvent[]>(await DB.getAsset(eventsKey(charId, dayKey)));
    return Array.isArray(parsed) ? parsed : [];
  },

  async saveEvents(charId: string, dayKey: string, events: PixelLifeEvent[]): Promise<void> {
    const normalized = events
      .filter(e => e && e.charId === charId && e.dayKey === dayKey)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_EVENTS_PER_DAY);
    await DB.saveAsset(eventsKey(charId, dayKey), JSON.stringify(normalized));
  },
};

export const runPixelLifeCatchup = async (
  char: LifeCharProfile,
  options: Omit<SimulatePixelLifeOptions, 'char' | 'state' | 'recentEvents'> = {},
): Promise<{ state: PixelLifeState; todayEvents: PixelLifeEvent[]; newEvents: PixelLifeEvent[] }> => {
  const now = options.now ?? Date.now();
  const dayKey = getPixelLifeDayKey(now);
  const [savedState, todayEvents] = await Promise.all([
    PixelLifeDB.getState(char.id),
    PixelLifeDB.getEvents(char.id, dayKey),
  ]);
  const state = savedState || createDefaultPixelLifeState(char.id, now);
  const result = simulatePixelLifeCatchup({
    ...options,
    char,
    state,
    recentEvents: todayEvents,
    now,
  });

  if (result.events.length > 0 || !savedState || result.state.dayKey !== state.dayKey) {
    await PixelLifeDB.saveState(result.state);
  }
  if (result.events.length > 0) {
    await PixelLifeDB.saveEvents(char.id, dayKey, [...todayEvents, ...result.events]);
  }

  return {
    state: result.state,
    todayEvents: result.events.length > 0 ? [...todayEvents, ...result.events].slice(-MAX_EVENTS_PER_DAY) : todayEvents,
    newEvents: result.events,
  };
};
