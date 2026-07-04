import { describe, expect, it } from 'vitest';
import {
  createStablePixelCitySeed,
  generatePixelCity,
  inferPixelCityTheme,
  PIXEL_CITY_PLACE_IDS,
} from '../apps/pixelHome/cityGenerator';

const baseChar = {
  id: 'city-char-test',
  name: '沈泽清',
  description: '現代の街で仕事をして、時々カフェで休む。',
  systemPrompt: '',
  worldview: '',
};

const signatureOf = (seed: string) => {
  const city = generatePixelCity(baseChar, seed, 123456);
  return city.places.map(place => `${place.id}:${place.name}:${place.x},${place.y},${place.w},${place.h}`).join('|');
};

describe('pixel city generator', () => {
  it('同じ seed なら同じ街になる', () => {
    expect(signatureOf('same-seed')).toBe(signatureOf('same-seed'));
  });

  it('seed が違えば配置が変わる', () => {
    expect(signatureOf('seed-a')).not.toBe(signatureOf('seed-b'));
  });

  it('charId から安定 seed を作る', () => {
    expect(createStablePixelCitySeed('abc')).toBe(createStablePixelCitySeed('abc'));
    expect(createStablePixelCitySeed('abc')).not.toBe(createStablePixelCitySeed('def'));
  });

  it('必須 place を生成する', () => {
    const city = generatePixelCity(baseChar, 'required-places', 123456);
    const types = new Set(city.places.map(place => place.type));
    const ids = new Set(city.places.map(place => place.id));

    expect(types.has('home')).toBe(true);
    expect(types.has('street')).toBe(true);
    expect(types.has('cafe')).toBe(true);
    expect(types.has('park')).toBe(true);
    expect(types.has('station')).toBe(true);
    expect(ids.has(PIXEL_CITY_PLACE_IDS.street)).toBe(true);
  });

  it('place graph が孤立しない', () => {
    const city = generatePixelCity(baseChar, 'connected', 123456);
    const byId = new Map(city.places.map(place => [place.id, place]));
    const seen = new Set<string>();
    const stack = [PIXEL_CITY_PLACE_IDS.street];

    while (stack.length > 0) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const place = byId.get(id);
      if (!place) continue;
      stack.push(...place.connectedPlaceIds);
    }

    expect(seen.size).toBe(city.places.length);
  });

  it('キャラ設定から worldStyle を推定する', () => {
    expect(inferPixelCityTheme({ ...baseChar, description: '学校と教室が中心の学園生活' })).toBe('school');
    expect(inferPixelCityTheme({ ...baseChar, description: 'アイドルのライブと練習室' })).toBe('entertainment');
    expect(inferPixelCityTheme({ ...baseChar, description: '魔法市と古い書庫を歩く魔女' })).toBe('magic');
    expect(inferPixelCityTheme({ ...baseChar, description: '探偵事務所と深夜のバー' })).toBe('noir');
  });
});

