import React, { useMemo, useRef, useState } from 'react';
import type { MemoryRoom } from '../../utils/memoryPalace/types';
import type { PixelLifeEvent, PixelLifeState } from './types';
import { getPixelLifeActionLabel } from './lifeSim';
import { ROOM_META } from './roomTemplates';

interface PixelLifeLogOverlayProps {
  events: PixelLifeEvent[];
  lifeState: PixelLifeState | null;
  userName: string;
  variant: 'map' | 'room';
}

const formatLifeEventTime = (timestamp: number) => {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
};

const getRoomName = (roomId: MemoryRoom, userName: string) =>
  roomId === 'user_room' ? `${userName}的房` : ROOM_META[roomId]?.name || roomId;

const LifeLogPanelBody: React.FC<{
  visibleEvents: PixelLifeEvent[];
  currentText: string;
  hasMemoryCandidate: boolean;
  userName: string;
  trailingAction?: React.ReactNode;
}> = ({ visibleEvents, currentText, hasMemoryCandidate, userName, trailingAction }) => (
  <>
    <div className="mb-2 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-bold tracking-wide text-slate-100">今日的生活日志</div>
        <div className="mt-0.5 truncate text-[10px] text-slate-400">现在：{currentText}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {hasMemoryCandidate && (
          <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[9px] font-bold text-amber-200">
            记忆候选
          </span>
        )}
        {trailingAction}
      </div>
    </div>

    <div className="space-y-1.5">
      {visibleEvents.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-slate-300">
          今天还在慢慢开始。
        </div>
      )}
      {visibleEvents.map(event => (
        <div
          key={event.id}
          className={`rounded-xl border px-3 py-2 ${event.memoryCandidate ? 'border-amber-300/30 bg-amber-300/10' : 'border-white/10 bg-white/5'}`}
        >
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span className="tabular-nums">{formatLifeEventTime(event.timestamp)}</span>
            <span>{getRoomName(event.placeId, userName)}</span>
            <span className="min-w-0 flex-1 truncate font-bold text-slate-200">{event.title}</span>
          </div>
          <div className="mt-0.5 truncate text-[10px] leading-4 text-slate-300">{event.summary}</div>
        </div>
      ))}
    </div>
  </>
);

const PixelLifeLogOverlay: React.FC<PixelLifeLogOverlayProps> = ({
  events,
  lifeState,
  userName,
  variant,
}) => {
  const [collapsed, setCollapsed] = useState(variant === 'room');
  const lastToggleAtRef = useRef(0);
  const visibleEvents = useMemo(
    () => [...events].sort((a, b) => b.timestamp - a.timestamp).slice(0, variant === 'room' ? 3 : 4),
    [events, variant],
  );
  const currentText = lifeState
    ? `${getRoomName(lifeState.currentPlaceId, userName)} · ${getPixelLifeActionLabel(lifeState.currentActionType)}`
    : '正在醒来';
  const hasMemoryCandidate = visibleEvents.some(event => event.memoryCandidate);

  const stopOverlayEvent = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  const runOnce = (event: React.SyntheticEvent, action: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    const now = Date.now();
    if (now - lastToggleAtRef.current < 900) return;
    lastToggleAtRef.current = now;
    action();
  };

  const expandPanel = (event: React.SyntheticEvent) => {
    runOnce(event, () => setCollapsed(false));
  };

  const collapsePanel = (event: React.SyntheticEvent) => {
    runOnce(event, () => setCollapsed(true));
  };

  if (variant === 'room') {
    const roomTab = (
      <button
        type="button"
        aria-label={collapsed ? '展开生活日志' : '折叠生活日志'}
        onClick={collapsed ? expandPanel : collapsePanel}
        onMouseDown={collapsed ? expandPanel : collapsePanel}
        onPointerDown={collapsed ? expandPanel : collapsePanel}
        onTouchStart={collapsed ? expandPanel : collapsePanel}
        className="pointer-events-auto absolute right-2 top-1/2 z-[75] -translate-y-1/2 cursor-pointer select-none rounded-l-2xl border border-white/10 bg-slate-950/80 px-2 py-3 text-[10px] font-bold text-amber-100 shadow-2xl backdrop-blur-md transition-transform active:scale-95"
      >
        <span className="block leading-none">日</span>
        <span className="mt-1 block leading-none">志</span>
      </button>
    );

    if (collapsed) {
      return roomTab;
    }

    return (
      <>
        {roomTab}
        <section
          className="pointer-events-auto absolute bottom-3 right-10 z-[70] max-h-36 w-[min(24rem,calc(100vw-4.5rem))] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/75 p-3 shadow-2xl backdrop-blur-md no-scrollbar"
          onClick={stopOverlayEvent}
          onPointerDown={stopOverlayEvent}
          onTouchStart={stopOverlayEvent}
        >
          <LifeLogPanelBody
            visibleEvents={visibleEvents}
            currentText={currentText}
            hasMemoryCandidate={hasMemoryCandidate}
            userName={userName}
          />
        </section>
      </>
    );
  }

  if (collapsed) {
    return (
      <button
        type="button"
        aria-label="展开生活日志"
        onClick={expandPanel}
        onMouseDown={expandPanel}
        onPointerDown={expandPanel}
        onTouchStart={expandPanel}
        className="absolute bottom-3 right-3 z-[60] rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 text-[10px] font-bold text-amber-100 shadow-2xl backdrop-blur-md transition-transform active:scale-95"
      >
        日志
      </button>
    );
  }

  const panelClassName = variant === 'room'
    ? 'absolute bottom-3 left-3 right-10 z-[70] max-h-36 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/75 p-3 shadow-2xl backdrop-blur-md no-scrollbar'
    : 'absolute left-3 right-3 bottom-3 z-[60] max-h-40 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-2xl backdrop-blur-md';

  return (
    <section
      className={panelClassName}
      onClick={stopOverlayEvent}
      onPointerDown={stopOverlayEvent}
      onTouchStart={stopOverlayEvent}
    >
      <LifeLogPanelBody
        visibleEvents={visibleEvents}
        currentText={currentText}
        hasMemoryCandidate={hasMemoryCandidate}
        userName={userName}
        trailingAction={
          <button
            type="button"
            aria-label="折叠生活日志"
            onClick={collapsePanel}
            onMouseDown={collapsePanel}
            onPointerDown={collapsePanel}
            onTouchStart={collapsePanel}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-[11px] font-bold text-slate-300 transition-colors hover:bg-white/10 active:scale-95"
          >
            ⌄
          </button>
        }
      />
    </section>
  );
};

export default PixelLifeLogOverlay;
