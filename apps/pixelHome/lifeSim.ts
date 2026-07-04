import type { CharacterProfile } from '../../types';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import { ROOM_META } from './roomTemplates';
import type {
  PixelLifeActionType,
  PixelLifeEvent,
  PixelLifeMemoryCandidate,
  PixelLifePlaceId,
  PixelLifeState,
} from './types';
import { getPixelCityPlaceName, PIXEL_CITY_PLACE_IDS } from './cityGenerator';

export type PixelLifeTimeBand = 'morning' | 'day' | 'evening' | 'night';

type LifeCharProfile = Pick<CharacterProfile, 'id' | 'name' | 'description' | 'systemPrompt' | 'worldview'>;

interface LifeCandidate {
  placeId: PixelLifePlaceId;
  actionType: PixelLifeActionType;
  title: string;
  summary: string;
  moodDelta?: number;
  energyDelta?: number;
  socialDelta?: number;
  importance: number;
  memoryCandidate?: boolean;
}

export interface SimulatePixelLifeOptions {
  char: LifeCharProfile;
  state?: PixelLifeState | null;
  recentEvents?: PixelLifeEvent[];
  now?: number;
  maxEvents?: number;
  stepMs?: number;
  rng?: () => number;
}

export interface SimulatePixelLifeResult {
  state: PixelLifeState;
  events: PixelLifeEvent[];
}

export const PIXEL_LIFE_DEFAULT_STEP_MS = 60 * 60 * 1000;
export const PIXEL_LIFE_MIN_ELAPSED_MS = 30 * 60 * 1000;
export const PIXEL_LIFE_DEFAULT_MAX_EVENTS = 6;
export const PIXEL_LIFE_MEMORY_IMPORTANCE_THRESHOLD = 7;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const clampStat = (value: number) => clamp(Math.round(value), 0, 100);
const clampImportance = (value: number) => clamp(Math.round(value), 1, 10);
const isMemoryRoom = (placeId: PixelLifePlaceId): placeId is MemoryRoom => placeId in ROOM_META;

export const getPixelLifeDayKey = (timestamp: number = Date.now()): string => {
  const date = new Date(timestamp);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getPixelLifeDayStart = (timestamp: number): number => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const getPixelLifeTimeBand = (timestamp: number): PixelLifeTimeBand => {
  const hour = new Date(timestamp).getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
};

export const shouldPromoteLifeEventToMemory = (importance: number, explicit?: boolean): boolean => {
  return Boolean(explicit) || clampImportance(importance) >= PIXEL_LIFE_MEMORY_IMPORTANCE_THRESHOLD;
};

export const createDefaultPixelLifeState = (
  charId: string,
  now: number = Date.now(),
): PixelLifeState => ({
  charId,
  currentPlaceId: 'living_room',
  currentActionType: 'rest',
  mood: 58,
  energy: 62,
  social: 52,
  lastSimulatedAt: now - PIXEL_LIFE_DEFAULT_STEP_MS,
  dayKey: getPixelLifeDayKey(now),
  todayEventIds: [],
});

const includesAny = (text: string, needles: string[]) => needles.some(n => text.includes(n));

const inferPersona = (char: LifeCharProfile, state: PixelLifeState) => {
  const text = `${char.description || ''}\n${char.worldview || ''}\n${char.systemPrompt || ''}`.toLowerCase();
  const job = state.job
    || (includesAny(text, ['学生', '学校', '大学', 'study', 'class']) ? '学习'
      : includesAny(text, ['医生', '护士', '诊所', 'hospital']) ? '照护工作'
      : includesAny(text, ['老师', '教师', 'teach']) ? '教学'
      : includesAny(text, ['作家', '写作', '小说', 'writer']) ? '写作'
      : includesAny(text, ['店', '咖啡', 'barista', 'cafe']) ? '店里的事'
      : '自己的事');

  const hobbies = state.hobbies?.length ? state.hobbies : [
    includesAny(text, ['音乐', '唱歌', '歌', 'music']) ? '音乐' : '',
    includesAny(text, ['料理', '烘焙', '做饭', 'cook']) ? '料理' : '',
    includesAny(text, ['画画', '绘画', '插画', 'art']) ? '画画' : '',
    includesAny(text, ['摄影', '拍照', 'camera']) ? '摄影' : '',
    includesAny(text, ['游戏', 'game']) ? '游戏' : '',
    includesAny(text, ['读书', '阅读', '书']) ? '阅读' : '',
  ].filter(Boolean);

  return {
    job,
    hobby: hobbies[0] || '喜欢的事',
    worldStyle: state.worldStyle || (char.worldview ? '角色世界观' : undefined),
  };
};

export const getPixelLifeActionLabel = (actionType: PixelLifeActionType): string => {
  switch (actionType) {
    case 'wake': return '起床';
    case 'meal': return '吃点东西';
    case 'work': return '处理事情';
    case 'study': return '学习';
    case 'hobby': return '兴趣时间';
    case 'social': return '社交';
    case 'reflect': return '想事情';
    case 'tidy': return '整理';
    case 'sleep': return '休息';
    case 'rest':
    default:
      return '放松';
  }
};

const getBaseCandidates = (
  band: PixelLifeTimeBand,
  char: LifeCharProfile,
  state: PixelLifeState,
): LifeCandidate[] => {
  const persona = inferPersona(char, state);
  const candidates: LifeCandidate[] = [];

  if (band === 'morning') {
    candidates.push(
      {
        placeId: 'bedroom',
        actionType: 'wake',
        title: '醒来整理',
        summary: `${char.name}把今天的状态慢慢找回来。`,
        moodDelta: 1,
        energyDelta: 5,
        importance: 3,
      },
      {
        placeId: 'living_room',
        actionType: 'meal',
        title: '简单早餐',
        summary: `${char.name}在客厅边吃东西边想今天先做什么。`,
        moodDelta: 1,
        energyDelta: 6,
        importance: 3,
      },
      {
        placeId: 'study',
        actionType: persona.job === '学习' ? 'study' : 'work',
        title: '查看今日安排',
        summary: `${char.name}翻了一下和${persona.job}有关的待办。`,
        energyDelta: -3,
        importance: 4,
      },
      {
        placeId: PIXEL_CITY_PLACE_IDS.station,
        actionType: 'work',
        title: '出门看一眼天气',
        summary: `${char.name}走到站前，确认今天外面的节奏。`,
        moodDelta: 1,
        energyDelta: -2,
        importance: 4,
      },
    );
  } else if (band === 'day') {
    candidates.push(
      {
        placeId: 'study',
        actionType: persona.job === '学习' ? 'study' : 'work',
        title: `处理${persona.job}`,
        summary: `${char.name}专心推进了一小段${persona.job}。`,
        energyDelta: -8,
        moodDelta: 1,
        importance: 5,
      },
      {
        placeId: 'windowsill',
        actionType: 'rest',
        title: '短暂透气',
        summary: `${char.name}到露台站了一会儿，把脑子里的声音放轻。`,
        moodDelta: 2,
        energyDelta: 2,
        importance: 4,
      },
      {
        placeId: 'living_room',
        actionType: 'social',
        title: '回了几条消息',
        summary: `${char.name}想起有人还在等回复，于是补了几句。`,
        socialDelta: 6,
        energyDelta: -2,
        importance: 5,
      },
      {
        placeId: PIXEL_CITY_PLACE_IDS.workplace,
        actionType: persona.job === '学习' ? 'study' : 'work',
        title: `去${persona.job}的地方`,
        summary: `${char.name}离开家，去街区里处理一段${persona.job}。`,
        energyDelta: -7,
        moodDelta: 1,
        importance: 5,
      },
      {
        placeId: PIXEL_CITY_PLACE_IDS.cafe,
        actionType: 'rest',
        title: '咖啡店短休',
        summary: `${char.name}在咖啡店坐了一会儿，让思绪慢慢落地。`,
        moodDelta: 3,
        energyDelta: 3,
        importance: 5,
      },
      {
        placeId: PIXEL_CITY_PLACE_IDS.park,
        actionType: 'reflect',
        title: '公园散步',
        summary: `${char.name}沿着小公园走了一圈，心里有些话没有急着说出口。`,
        moodDelta: 2,
        energyDelta: -2,
        importance: 6,
      },
    );
  } else if (band === 'evening') {
    candidates.push(
      {
        placeId: 'living_room',
        actionType: 'social',
        title: '晚间闲聊',
        summary: `${char.name}在客厅待着，心情比白天松了一点。`,
        socialDelta: 5,
        moodDelta: 2,
        importance: 5,
      },
      {
        placeId: 'self_room',
        actionType: 'hobby',
        title: `${persona.hobby}时间`,
        summary: `${char.name}给${persona.hobby}留了一小段安静时间。`,
        moodDelta: 4,
        energyDelta: -2,
        importance: 5,
      },
      {
        placeId: 'study',
        actionType: 'tidy',
        title: '收尾整理',
        summary: `${char.name}把今天没做完的事先收进明天。`,
        moodDelta: 1,
        energyDelta: -3,
        importance: 4,
      },
      {
        placeId: PIXEL_CITY_PLACE_IDS.shop,
        actionType: 'meal',
        title: '买了点饮料',
        summary: `${char.name}顺路买了点喝的，把傍晚带回家。`,
        moodDelta: 2,
        energyDelta: 2,
        importance: 4,
      },
      {
        placeId: PIXEL_CITY_PLACE_IDS.cafe,
        actionType: 'social',
        title: '街角小坐',
        summary: `${char.name}在街角停留了一阵，像是在等一句合适的话。`,
        socialDelta: 4,
        moodDelta: 2,
        importance: 6,
      },
      {
        placeId: PIXEL_CITY_PLACE_IDS.special,
        actionType: 'reflect',
        title: '绕去特别的地方',
        summary: `${char.name}绕到那个很像自己的地方，心情留下了一点痕迹。`,
        moodDelta: 2,
        energyDelta: -3,
        importance: 7,
      },
    );
  } else {
    candidates.push(
      {
        placeId: 'bedroom',
        actionType: 'sleep',
        title: '准备休息',
        summary: `${char.name}把灯调暗，准备让今天慢慢结束。`,
        moodDelta: 1,
        energyDelta: 8,
        importance: 4,
      },
      {
        placeId: 'self_room',
        actionType: 'reflect',
        title: '写下今日心情',
        summary: `${char.name}留下一句只有自己看得懂的心情。`,
        moodDelta: 2,
        energyDelta: -2,
        importance: 6,
      },
      {
        placeId: 'attic',
        actionType: 'reflect',
        title: '翻到旧想法',
        summary: `${char.name}想起一件还没有完全消化的小事。`,
        moodDelta: -2,
        energyDelta: -1,
        importance: 7,
      },
      {
        placeId: PIXEL_CITY_PLACE_IDS.station,
        actionType: 'reflect',
        title: '夜里的站前',
        summary: `${char.name}在站前看了一会儿灯，觉得今天还没有完全结束。`,
        moodDelta: 1,
        energyDelta: -4,
        importance: 6,
      },
    );
  }

  if (state.energy < 35) {
    candidates.unshift({
      placeId: 'bedroom',
      actionType: 'rest',
      title: '补一点体力',
      summary: `${char.name}有点累，先把节奏放慢。`,
      moodDelta: 1,
      energyDelta: 12,
      importance: 5,
    });
  }

  if (state.social < 30) {
    candidates.unshift({
      placeId: 'user_room',
      actionType: 'social',
      title: '想起你',
      summary: `${char.name}经过你的房间，短暂想起你最近说过的话。`,
      socialDelta: 10,
      moodDelta: 2,
      importance: 7,
    });
  }

  if (state.mood < 32) {
    candidates.unshift({
      placeId: 'attic',
      actionType: 'reflect',
      title: '情绪打结',
      summary: `${char.name}被一小团情绪绊住，暂时没有急着掩饰。`,
      moodDelta: -1,
      energyDelta: -3,
      importance: 8,
    });
  }

  return candidates;
};

export const selectPixelLifeEventCandidate = (opts: {
  char: LifeCharProfile;
  state: PixelLifeState;
  recentEvents?: PixelLifeEvent[];
  timestamp: number;
  rng?: () => number;
}): LifeCandidate => {
  const band = getPixelLifeTimeBand(opts.timestamp);
  const candidates = getBaseCandidates(band, opts.char, opts.state);
  const last = opts.recentEvents?.[opts.recentEvents.length - 1];
  const filtered = last
    ? candidates.filter(c => c.actionType !== last.actionType || c.placeId !== last.placeId || c.title !== last.title)
    : candidates;
  const pool = filtered.length > 0 ? filtered : candidates;
  const rng = opts.rng || Math.random;
  return pool[Math.floor(clamp(rng(), 0, 0.999999) * pool.length)];
};

const createLifeEvent = (
  char: LifeCharProfile,
  candidate: LifeCandidate,
  timestamp: number,
  rng: () => number,
): PixelLifeEvent => {
  const importance = clampImportance(candidate.importance);
  return {
    id: `pixel_life_${char.id}_${timestamp}_${candidate.actionType}_${Math.floor(rng() * 1_000_000)}`,
    charId: char.id,
    timestamp,
    dayKey: getPixelLifeDayKey(timestamp),
    placeId: candidate.placeId,
    actionType: candidate.actionType,
    title: candidate.title,
    summary: candidate.summary,
    moodDelta: candidate.moodDelta,
    energyDelta: candidate.energyDelta,
    socialDelta: candidate.socialDelta,
    importance,
    memoryCandidate: shouldPromoteLifeEventToMemory(importance, candidate.memoryCandidate),
    createdBy: 'rule',
  };
};

const applyEventToState = (state: PixelLifeState, event: PixelLifeEvent): PixelLifeState => ({
  ...state,
  currentPlaceId: event.placeId,
  currentActionType: event.actionType,
  mood: clampStat(state.mood + (event.moodDelta || 0)),
  energy: clampStat(state.energy + (event.energyDelta || 0)),
  social: clampStat(state.social + (event.socialDelta || 0)),
  dayKey: event.dayKey,
  todayEventIds: [...state.todayEventIds, event.id].slice(-80),
});

export const simulatePixelLifeCatchup = (opts: SimulatePixelLifeOptions): SimulatePixelLifeResult => {
  const now = opts.now ?? Date.now();
  const dayKey = getPixelLifeDayKey(now);
  const maxEvents = clamp(Math.floor(opts.maxEvents ?? PIXEL_LIFE_DEFAULT_MAX_EVENTS), 0, 8);
  const stepMs = Math.max(PIXEL_LIFE_MIN_ELAPSED_MS, opts.stepMs ?? PIXEL_LIFE_DEFAULT_STEP_MS);
  const rng = opts.rng || Math.random;
  const previousState = opts.state || createDefaultPixelLifeState(opts.char.id, now);
  const sameDay = previousState.dayKey === dayKey;
  let state: PixelLifeState = {
    ...previousState,
    dayKey,
    todayEventIds: sameDay ? previousState.todayEventIds : [],
  };

  const startAt = sameDay
    ? state.lastSimulatedAt
    : Math.max(getPixelLifeDayStart(now), now - maxEvents * stepMs);
  const elapsedMs = Math.max(0, now - startAt);
  if (maxEvents <= 0 || elapsedMs < PIXEL_LIFE_MIN_ELAPSED_MS) {
    return { state, events: [] };
  }

  const count = clamp(Math.floor(elapsedMs / stepMs) || 1, 1, maxEvents);
  const events: PixelLifeEvent[] = [];
  const rollingRecent = [...(opts.recentEvents || [])];

  for (let i = 0; i < count; i += 1) {
    const timestamp = Math.min(now, startAt + Math.round((elapsedMs * (i + 1)) / (count + 1)));
    const candidate = selectPixelLifeEventCandidate({
      char: opts.char,
      state,
      recentEvents: rollingRecent,
      timestamp,
      rng,
    });
    const event = createLifeEvent(opts.char, candidate, timestamp, rng);
    events.push(event);
    rollingRecent.push(event);
    state = applyEventToState(state, event);
  }

  return {
    state: {
      ...state,
      lastSimulatedAt: now,
    },
    events,
  };
};

export const buildPixelLifeMemoryCandidate = (
  event: PixelLifeEvent,
  charName: string,
): PixelLifeMemoryCandidate | null => {
  if (!event.memoryCandidate) return null;
  const room = isMemoryRoom(event.placeId) ? event.placeId : 'living_room';
  const roomName = isMemoryRoom(event.placeId) ? ROOM_META[event.placeId].name : getPixelCityPlaceName(event.placeId);
  const actionLabel = getPixelLifeActionLabel(event.actionType);
  return {
    source: 'pixel-home-life',
    charId: event.charId,
    eventId: event.id,
    content: `${charName}在${roomName}${actionLabel}：${event.summary}`,
    room,
    importance: event.importance,
    mood: event.moodDelta && event.moodDelta < 0 ? '低落' : event.moodDelta && event.moodDelta > 0 ? '平稳变好' : '平稳',
    tags: ['pixel-home', 'life-log', event.actionType, event.placeId],
    createdAt: event.timestamp,
  };
};
