import type { CharacterProfile } from '../../types';
import { DB } from '../../utils/db';
import type { PixelCityMapState } from './types';
import { createStablePixelCitySeed, generatePixelCity } from './cityGenerator';

type CityCharProfile = Pick<CharacterProfile, 'id' | 'name' | 'description' | 'systemPrompt' | 'worldview'>;

const cityKey = (charId: string) => `pixel_city_${charId}`;

const safeJsonParse = <T,>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const isUsableCity = (city: PixelCityMapState | null, charId: string): city is PixelCityMapState => {
  return Boolean(
    city
      && city.charId === charId
      && city.seed
      && Array.isArray(city.places)
      && city.places.some(place => place.type === 'home')
      && city.places.some(place => place.type === 'street')
      && Array.isArray(city.tiles),
  );
};

export const PixelCityDB = {
  async get(charId: string): Promise<PixelCityMapState | null> {
    return safeJsonParse<PixelCityMapState>(await DB.getAsset(cityKey(charId)));
  },

  async save(city: PixelCityMapState): Promise<void> {
    await DB.saveAsset(cityKey(city.charId), JSON.stringify(city));
  },
};

export const getOrCreatePixelCity = async (char: CityCharProfile): Promise<PixelCityMapState> => {
  const saved = await PixelCityDB.get(char.id);
  if (isUsableCity(saved, char.id)) return saved;
  const city = generatePixelCity(char, saved?.seed || createStablePixelCitySeed(char.id));
  await PixelCityDB.save(city);
  return city;
};

