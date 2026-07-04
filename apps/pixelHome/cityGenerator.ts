import type { CharacterProfile } from '../../types';
import type {
  PixelCityDistrict,
  PixelCityMapState,
  PixelCityObject,
  PixelCityPlace,
  PixelCityPlaceId,
  PixelCityRoad,
  PixelCityTheme,
  PixelCityTile,
} from './types';

type CityCharProfile = Pick<CharacterProfile, 'id' | 'name' | 'description' | 'systemPrompt' | 'worldview'>;

export const PIXEL_CITY_DEFAULT_WIDTH = 22;
export const PIXEL_CITY_DEFAULT_HEIGHT = 16;
export const PIXEL_CITY_TILE_SIZE = 18;

export const PIXEL_CITY_PLACE_IDS = {
  home: 'city_home',
  street: 'city_street_main',
  cafe: 'city_cafe',
  park: 'city_park',
  station: 'city_station',
  workplace: 'city_workplace',
  school: 'city_school',
  shop: 'city_shop',
  special: 'city_special',
} as const satisfies Record<string, PixelCityPlaceId>;

const hashString = (value: string): number => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const createStablePixelCitySeed = (charId: string): string => {
  return `city-${charId}-${hashString(charId).toString(36)}`;
};

export const createSeededRandom = (seed: string): (() => number) => {
  let t = hashString(seed) || 0x9e3779b9;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const includesAny = (text: string, needles: string[]) => needles.some(needle => text.includes(needle));

export const inferPixelCityTheme = (char: CityCharProfile): PixelCityTheme => {
  const text = `${char.name || ''}\n${char.description || ''}\n${char.worldview || ''}\n${char.systemPrompt || ''}`.toLowerCase();
  if (includesAny(text, ['学校', '学生', '学園', '大学', '教室', 'class', 'school'])) return 'school';
  if (includesAny(text, ['アイドル', 'idol', '芸能', '唱歌', '音乐', 'ライブ', '舞台', '练习', '练舞'])) return 'entertainment';
  if (includesAny(text, ['魔法', '魔女', 'wizard', 'witch', '咒', '精灵', '幻想'])) return 'magic';
  if (includesAny(text, ['侦探', '探偵', '黑', '闇', '酒吧', 'bar', '案件', 'noir', 'mafia'])) return 'noir';
  return 'modern';
};

const themeNames: Record<PixelCityTheme, {
  district: string;
  cafe: string;
  park: string;
  station: string;
  workplace: string;
  school: string;
  shop: string;
  special: string;
  specialType: 'workplace' | 'school' | 'special';
}> = {
  modern: {
    district: '日常街区',
    cafe: '街角咖啡',
    park: '口袋公园',
    station: '小站前',
    workplace: '工作室',
    school: '自习室',
    shop: '便利店',
    special: '安静巷口',
    specialType: 'special',
  },
  school: {
    district: '放学街区',
    cafe: '校门咖啡',
    park: '操场边公园',
    station: '放学路口',
    workplace: '社团教室',
    school: '教学楼',
    shop: '小卖部',
    special: '屋顶入口',
    specialType: 'school',
  },
  entertainment: {
    district: '练习街区',
    cafe: '后台咖啡',
    park: '休息广场',
    station: '剧场前站',
    workplace: '练习室',
    school: '声乐教室',
    shop: '服装小店',
    special: 'Live House',
    specialType: 'workplace',
  },
  magic: {
    district: '魔法市集',
    cafe: '药草茶馆',
    park: '月光庭院',
    station: '传送站',
    workplace: '炼金工坊',
    school: '旧书库',
    shop: '路地の店',
    special: '星尘塔',
    specialType: 'special',
  },
  noir: {
    district: '夜色街区',
    cafe: '深夜咖啡',
    park: '雨后小园',
    station: '末班站台',
    workplace: '事务所',
    school: '档案室',
    shop: '旧货铺',
    special: '后巷酒吧',
    specialType: 'special',
  },
};

const pick = <T,>(items: T[], rng: () => number): T => items[Math.floor(rng() * items.length)];

const jitter = (value: number, rng: () => number, amount = 1) => value + Math.round((rng() - 0.5) * amount * 2);

const clampTile = (value: number, max: number) => Math.max(1, Math.min(max - 3, value));

const createTiles = (width: number, height: number, roads: PixelCityRoad[], places: PixelCityPlace[]): PixelCityTile[] => {
  const tiles: PixelCityTile[] = [];
  const roadKey = new Set<string>();
  roads.forEach(road => {
    const minX = Math.min(road.x1, road.x2);
    const maxX = Math.max(road.x1, road.x2);
    const minY = Math.min(road.y1, road.y2);
    const maxY = Math.max(road.y1, road.y2);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) roadKey.add(`${x},${y}`);
    }
  });
  const buildingKey = new Set<string>();
  places.filter(place => place.type !== 'street' && place.type !== 'park').forEach(place => {
    for (let y = place.y; y < place.y + place.h; y += 1) {
      for (let x = place.x; x < place.x + place.w; x += 1) buildingKey.add(`${x},${y}`);
    }
  });
  const park = places.find(place => place.type === 'park');
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let kind: PixelCityTile['kind'] = 'grass';
      if (roadKey.has(`${x},${y}`)) kind = 'road';
      if (park && x >= park.x && x < park.x + park.w && y >= park.y && y < park.y + park.h) kind = 'plaza';
      if (buildingKey.has(`${x},${y}`)) kind = 'building';
      tiles.push({ x, y, kind });
    }
  }
  return tiles;
};

export const generatePixelCity = (
  char: CityCharProfile,
  seed: string = createStablePixelCitySeed(char.id),
  now: number = Date.now(),
): PixelCityMapState => {
  const rng = createSeededRandom(`${char.id}:${seed}`);
  const theme = inferPixelCityTheme(char);
  const names = themeNames[theme];
  const width = PIXEL_CITY_DEFAULT_WIDTH;
  const height = PIXEL_CITY_DEFAULT_HEIGHT;
  const mainY = 8 + Math.floor(rng() * 2);
  const mainX = 10 + Math.floor(rng() * 3);
  const roads: PixelCityRoad[] = [
    { id: 'road_main_h', x1: 0, y1: mainY, x2: width - 1, y2: mainY + 1, kind: 'main' },
    { id: 'road_main_v', x1: mainX, y1: 0, x2: mainX + 1, y2: height - 1, kind: 'main' },
    { id: 'road_side_north', x1: 2, y1: 4, x2: width - 4, y2: 4, kind: 'side' },
    { id: 'road_side_south', x1: 3, y1: 13, x2: width - 3, y2: 13, kind: 'side' },
  ];

  const westTop = { x: clampTile(jitter(2, rng), width), y: clampTile(jitter(2, rng), height) };
  const eastTop = { x: clampTile(jitter(width - 6, rng), width), y: clampTile(jitter(2, rng), height) };
  const westBottom = { x: clampTile(jitter(2, rng), width), y: clampTile(jitter(10, rng), height) };
  const eastBottom = { x: clampTile(jitter(width - 6, rng), width), y: clampTile(jitter(10, rng), height) };
  const center = { x: clampTile(mainX - 2, width), y: clampTile(mainY - 2, height) };
  const streetConnections = [
    PIXEL_CITY_PLACE_IDS.home,
    PIXEL_CITY_PLACE_IDS.cafe,
    PIXEL_CITY_PLACE_IDS.park,
    PIXEL_CITY_PLACE_IDS.station,
    PIXEL_CITY_PLACE_IDS.workplace,
    PIXEL_CITY_PLACE_IDS.shop,
    PIXEL_CITY_PLACE_IDS.special,
  ];

  const places: PixelCityPlace[] = [
    {
      id: PIXEL_CITY_PLACE_IDS.street,
      type: 'street',
      name: names.district,
      x: mainX,
      y: mainY,
      w: 2,
      h: 2,
      connectedPlaceIds: streetConnections,
      tags: ['street', theme],
      description: 'キャラの家と街の場所をつなぐ、ゆっくりした生活動線。',
      characterAffinity: 6,
    },
    {
      id: PIXEL_CITY_PLACE_IDS.home,
      type: 'home',
      name: `${char.name || 'TA'}的家`,
      x: westTop.x,
      y: westTop.y,
      w: 4,
      h: 3,
      connectedPlaceIds: [PIXEL_CITY_PLACE_IDS.street],
      tags: ['home', theme],
      description: '家の外側。ここから街へ出かけられる。',
      characterAffinity: 9,
    },
    {
      id: PIXEL_CITY_PLACE_IDS.cafe,
      type: 'cafe',
      name: names.cafe,
      x: eastTop.x,
      y: eastTop.y,
      w: 4,
      h: 3,
      connectedPlaceIds: [PIXEL_CITY_PLACE_IDS.street],
      tags: ['cafe', 'rest', theme],
      description: '少し休憩したり、考えを整えたりする場所。',
      characterAffinity: 7,
    },
    {
      id: PIXEL_CITY_PLACE_IDS.park,
      type: 'park',
      name: names.park,
      x: westBottom.x,
      y: westBottom.y,
      w: 5,
      h: 3,
      connectedPlaceIds: [PIXEL_CITY_PLACE_IDS.street],
      tags: ['park', 'walk', theme],
      description: '散歩やぼんやりした時間が起こりやすい小さな広場。',
      characterAffinity: 6,
    },
    {
      id: PIXEL_CITY_PLACE_IDS.station,
      type: 'station',
      name: names.station,
      x: eastBottom.x,
      y: eastBottom.y,
      w: 4,
      h: 3,
      connectedPlaceIds: [PIXEL_CITY_PLACE_IDS.street],
      tags: ['station', 'travel', theme],
      description: '外の予定や帰り道の気配が集まる場所。',
      characterAffinity: 5,
    },
    {
      id: PIXEL_CITY_PLACE_IDS.workplace,
      type: names.specialType === 'school' ? 'school' : 'workplace',
      name: names.workplace,
      x: center.x,
      y: Math.max(1, center.y - 4),
      w: 4,
      h: 3,
      connectedPlaceIds: [PIXEL_CITY_PLACE_IDS.street],
      tags: ['work', theme],
      description: '仕事・勉強・役割にまつわる生活イベントが起こる場所。',
      characterAffinity: 6,
    },
    {
      id: PIXEL_CITY_PLACE_IDS.shop,
      type: 'shop',
      name: names.shop,
      x: clampTile(mainX + 3, width),
      y: clampTile(mainY + 2, height),
      w: 4,
      h: 3,
      connectedPlaceIds: [PIXEL_CITY_PLACE_IDS.street],
      tags: ['shop', 'errand', theme],
      description: '飲み物や小物を買う、軽い外出先。',
      characterAffinity: 5,
    },
    {
      id: PIXEL_CITY_PLACE_IDS.special,
      type: names.specialType,
      name: names.special,
      x: clampTile(mainX - 6, width),
      y: clampTile(mainY + 3, height),
      w: 4,
      h: 3,
      connectedPlaceIds: [PIXEL_CITY_PLACE_IDS.street],
      tags: ['special', theme],
      description: 'そのキャラの世界観が少しにじむ、特別な寄り道先。',
      characterAffinity: 8,
    },
  ];

  const districts: PixelCityDistrict[] = [
    { id: 'district_home', name: '家のまわり', x: 0, y: 0, w: 8, h: 7 },
    { id: 'district_center', name: names.district, x: 7, y: 3, w: 8, h: 8 },
    { id: 'district_outing', name: '寄り道', x: 0, y: 9, w: width, h: 7 },
  ];

  const objectTypes: PixelCityObject['type'][] = ['tree', 'lamp', 'bench', 'sign', 'flower', 'vendor'];
  const placedObjects: PixelCityObject[] = Array.from({ length: 18 }, (_, index) => ({
    id: `obj_${index}`,
    type: pick(objectTypes, rng),
    x: Math.floor(rng() * width),
    y: Math.floor(rng() * height),
  })).filter(obj => !places.some(place => obj.x >= place.x && obj.x < place.x + place.w && obj.y >= place.y && obj.y < place.y + place.h));

  const tiles = createTiles(width, height, roads, places);

  return {
    cityId: `pixel_city_${char.id}`,
    charId: char.id,
    seed,
    theme,
    generatedAt: now,
    width,
    height,
    tileSize: PIXEL_CITY_TILE_SIZE,
    districts,
    places,
    roads,
    placedObjects,
    tiles,
  };
};

export const getPixelCityPlaceName = (placeId: string, city?: PixelCityMapState | null): string => {
  const place = city?.places.find(p => p.id === placeId);
  if (place) return place.name;
  const fallback = Object.values(themeNames.modern);
  if (fallback.includes(placeId)) return placeId;
  switch (placeId) {
    case PIXEL_CITY_PLACE_IDS.home: return '家の外';
    case PIXEL_CITY_PLACE_IDS.street: return '街区';
    case PIXEL_CITY_PLACE_IDS.cafe: return 'カフェ';
    case PIXEL_CITY_PLACE_IDS.park: return '公園';
    case PIXEL_CITY_PLACE_IDS.station: return '駅前';
    case PIXEL_CITY_PLACE_IDS.workplace: return '仕事場';
    case PIXEL_CITY_PLACE_IDS.school: return '学校';
    case PIXEL_CITY_PLACE_IDS.shop: return '店';
    case PIXEL_CITY_PLACE_IDS.special: return '特別な場所';
    default: return placeId;
  }
};

