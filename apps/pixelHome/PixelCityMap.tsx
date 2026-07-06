import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PixelCityMapState, PixelCityObject, PixelCityPlace, PixelLifeEvent, PixelLifeState } from './types';
import { getPixelLifeActionLabel } from './lifeSim';
import { getPixelCityPlaceName } from './cityGenerator';

interface PixelCityMapProps {
  city: PixelCityMapState;
  charSprite?: string;
  lifeState: PixelLifeState | null;
  lifeEvents: PixelLifeEvent[];
  userName: string;
}

const placeColor: Record<PixelCityPlace['type'], { bg: string; border: string; label: string }> = {
  home: { bg: '#f1d4b8', border: '#9d6b4e', label: '家' },
  street: { bg: '#868f9d', border: '#4b5563', label: '街' },
  cafe: { bg: '#d9a66f', border: '#8a552d', label: '咖' },
  park: { bg: '#83b86f', border: '#4d7f3e', label: '园' },
  station: { bg: '#9fb4d9', border: '#526c9c', label: '站' },
  workplace: { bg: '#b2a1d6', border: '#6b5ca0', label: '工' },
  school: { bg: '#d6bf70', border: '#917a2f', label: '学' },
  shop: { bg: '#d88fa5', border: '#96536a', label: '店' },
  special: { bg: '#86c8be', border: '#3c827a', label: '特' },
};

const tileColor: Record<string, string> = {
  grass: '#4f8f63',
  road: '#5f6670',
  plaza: '#7eaa6a',
  water: '#4e8fb6',
  building: '#72614f',
};

const objectGlyph: Record<PixelCityObject['type'], string> = {
  tree: '♣',
  lamp: '•',
  bench: '=',
  sign: '▣',
  flower: '✦',
  vendor: '▤',
};

const objectColor: Record<PixelCityObject['type'], string> = {
  tree: '#236d45',
  lamp: '#f7d77a',
  bench: '#7a5138',
  sign: '#f2eee6',
  flower: '#f4a7c4',
  vendor: '#d4b06a',
};

const isCityPlaceId = (id: string | undefined): id is PixelCityPlace['id'] => Boolean(id && id.startsWith('city_'));

const PixelCityMap: React.FC<PixelCityMapProps> = ({ city, charSprite, lifeState, lifeEvents, userName }) => {
  const initialPlace = useMemo(() => {
    const current = isCityPlaceId(lifeState?.currentPlaceId) ? city.places.find(p => p.id === lifeState.currentPlaceId) : null;
    return current || city.places.find(p => p.type === 'street') || city.places[0];
  }, [city, lifeState?.currentPlaceId]);
  const [selectedPlaceId, setSelectedPlaceId] = useState(initialPlace?.id);

  const selectedPlace = city.places.find(place => place.id === selectedPlaceId) || initialPlace;
  const currentPlace = isCityPlaceId(lifeState?.currentPlaceId)
    ? city.places.find(place => place.id === lifeState.currentPlaceId)
    : null;
  const currentAction = currentPlace && lifeState ? getPixelLifeActionLabel(lifeState.currentActionType) : '';
  const characterIsInCity = Boolean(currentPlace);
  const relatedEvents = selectedPlace
    ? lifeEvents.filter(event => event.placeId === selectedPlace.id).slice(-3).reverse()
    : [];

  useEffect(() => {
    if (initialPlace?.id) setSelectedPlaceId(prev => prev || initialPlace.id);
  }, [initialPlace?.id]);

  const tileSize = city.tileSize;
  const mapW = city.width * tileSize;
  const mapH = city.height * tileSize;

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#2f5b4f]">
      <div className="absolute left-3 right-3 top-3 z-30 rounded-2xl border border-white/10 bg-slate-950/75 px-3 py-2 shadow-xl backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[12px] font-bold text-slate-100">ピクセル街区 · {getPixelCityPlaceName(selectedPlace?.id || '', city)}</div>
            <div className="mt-0.5 truncate text-[10px] text-slate-400">
              seed {city.seed.replace(/^city-/, '').slice(0, 12)} · {city.theme}
            </div>
          </div>
          {characterIsInCity ? (
            <span className="shrink-0 rounded-full bg-emerald-300/15 px-2 py-1 text-[9px] font-bold text-emerald-100">
              现在：{getPixelCityPlaceName(currentPlace!.id, city)} · {currentAction}
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold text-slate-200">
              家の中
            </span>
          )}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-40 top-40 overflow-auto px-4 pb-4">
        <div
          className="relative mx-auto rounded-2xl border border-black/30 shadow-2xl"
          style={{ width: mapW, height: mapH, imageRendering: 'pixelated' as any }}
        >
          {city.tiles.map(tile => (
            <div
              key={`${tile.x}_${tile.y}`}
              className="absolute border border-black/5"
              style={{
                left: tile.x * tileSize,
                top: tile.y * tileSize,
                width: tileSize,
                height: tileSize,
                backgroundColor: tileColor[tile.kind] || tileColor.grass,
              }}
            />
          ))}

          {city.placedObjects.map(obj => (
            <div
              key={obj.id}
              className="pointer-events-none absolute grid place-items-center text-[10px] font-black leading-none"
              style={{
                left: obj.x * tileSize,
                top: obj.y * tileSize,
                width: tileSize,
                height: tileSize,
                color: objectColor[obj.type],
                textShadow: '0 1px 0 rgba(0,0,0,.35)',
              }}
            >
              {objectGlyph[obj.type]}
            </div>
          ))}

          {city.places.filter(place => place.type !== 'street').map(place => {
            const colors = placeColor[place.type];
            const active = selectedPlace?.id === place.id;
            const current = currentPlace?.id === place.id;
            const ringClass = current ? 'ring-2 ring-emerald-200' : active ? 'ring-2 ring-amber-200' : '';
            return (
              <button
                key={place.id}
                type="button"
                className={`absolute overflow-hidden rounded-sm border-2 text-left shadow-md transition-transform active:scale-95 ${ringClass}`}
                style={{
                  left: place.x * tileSize,
                  top: place.y * tileSize,
                  width: place.w * tileSize,
                  height: place.h * tileSize,
                  backgroundColor: colors.bg,
                  borderColor: colors.border,
                }}
                onClick={() => setSelectedPlaceId(place.id)}
              >
                <span className="absolute left-1 top-0.5 rounded bg-black/35 px-1 text-[8px] font-black text-white">
                  {colors.label}
                </span>
                <span className="absolute bottom-0 left-0 right-0 truncate bg-black/35 px-1 py-0.5 text-[8px] font-bold text-white">
                  {place.name}
                </span>
              </button>
            );
          })}

          <CityWalkingCharacter
            charSprite={charSprite}
            currentPlace={characterIsInCity ? currentPlace : null}
            currentAction={currentAction}
            tileSize={tileSize}
          />
        </div>
      </div>

      {selectedPlace && (
        <div className="absolute left-3 right-3 top-20 z-20 rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-bold text-slate-100">{selectedPlace.name}</div>
              <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-slate-300">{selectedPlace.description}</div>
            </div>
            <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[9px] font-bold text-slate-200">
              {selectedPlace.type}
            </span>
          </div>
          <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
            {selectedPlace.tags?.map(tag => (
              <span key={tag} className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[9px] text-slate-300">#{tag}</span>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            {relatedEvents.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] text-slate-300">
                今日ここでの生活ログはまだありません。
              </div>
            ) : relatedEvents.map(event => (
              <div key={event.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="truncate text-[10px] font-bold text-slate-200">{event.title}</div>
                <div className="mt-0.5 truncate text-[10px] text-slate-400">{event.summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const CityWalkingCharacter: React.FC<{
  charSprite?: string;
  currentPlace: PixelCityPlace | null;
  currentAction: string;
  tileSize: number;
}> = React.memo(({ charSprite, currentPlace, currentAction, tileSize }) => {
  const [walkStep, setWalkStep] = useState(0);
  const [walkOffset, setWalkOffset] = useState({ x: 0, y: 0 });
  const rngRef = useRef(0.37);

  useEffect(() => {
    setWalkOffset({ x: 0, y: 0 });
    setWalkStep(0);
  }, [currentPlace?.id]);

  useEffect(() => {
    if (!currentPlace) return;
    const timer = window.setInterval(() => {
      rngRef.current = (rngRef.current * 9301 + 49297) % 233280;
      const r1 = rngRef.current / 233280;
      rngRef.current = (rngRef.current * 9301 + 49297) % 233280;
      const r2 = rngRef.current / 233280;
      setWalkOffset({ x: (r1 - 0.5) * 0.8, y: (r2 - 0.5) * 0.45 });
      setWalkStep(step => 1 - step);
    }, 600);
    return () => window.clearInterval(timer);
  }, [currentPlace]);

  if (!charSprite || !currentPlace) return null;

  const charX = (currentPlace.x + currentPlace.w / 2 + walkOffset.x) * tileSize;
  const charY = (currentPlace.y + currentPlace.h / 2 + walkOffset.y) * tileSize;

  return (
    <div
      className="pointer-events-none absolute z-40"
      style={{
        left: charX,
        top: charY,
        width: 28,
        height: 28,
        transform: `translate(-50%, -100%) rotate(${walkStep === 0 ? -3 : 3}deg)`,
      }}
    >
      <img
        src={charSprite}
        alt=""
        className="drop-shadow-md"
        style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' as any }}
        draggable={false}
      />
      {currentAction && (
        <div className="absolute left-1/2 -top-5 -translate-x-1/2 whitespace-nowrap rounded-full bg-slate-950/80 px-1.5 py-0.5 text-[7px] font-bold text-white">
          {currentAction}
        </div>
      )}
    </div>
  );
});

export default React.memo(PixelCityMap);
