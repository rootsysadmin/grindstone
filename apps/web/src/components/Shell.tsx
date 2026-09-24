import { useEffect, useRef } from "react";
import { Outlet } from "react-router-dom";
import { RailIcon } from "./RailIcon.tsx";
import { useRunCommunitySync, useSyncStatus } from "../features/sync/api.ts";

const shapeCls = "w-[13px] h-[13px] border-[1.5px] border-current";

const railIcons = (
  <>
    <RailIcon to="/today" label="TODAY" icon={<span className={`${shapeCls} rounded-[3px]`} />} />
    <RailIcon to="/roster" label="ROSTER" icon={<span className={`${shapeCls} rounded-full`} />} />
    <RailIcon to="/planner" label="PLAN" icon={<span className={`${shapeCls} rounded-[3px] rotate-45`} />} />
    <RailIcon
      to="/calendar"
      label="CAL"
      icon={<span className="w-[13px] h-[11px] border-[1.5px] border-t-[4px] border-current rounded-[2px]" />}
    />
    <RailIcon
      to="/wishlist"
      label="WISH"
      icon={<span className="w-3 h-3 bg-current" style={{ clipPath: "polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)" }} />}
    />
  </>
);

const pinnedIcons = (
  <>
    <RailIcon to="/spend" label="SPEND" icon={<span className={`${shapeCls} rounded-full`} />} />
    <RailIcon
      to="/data"
      label="DATA"
      icon={<span className="w-[13px] h-[11px] border-[1.5px] border-current" style={{ borderRadius: "6px/4px" }} />}
    />
  </>
);

/**
 * The left icon rail is desktop-only (>=md) — below that it becomes a fixed
 * bottom bar, since a 62px-wide permanent sidebar eats too much of a phone
 * screen. Page bodies all use the same `h-screen` + inner `overflow-y-auto`
 * shape (see e.g. TodayPage.tsx), so rather than touching every page to make
 * room for the fixed bar, this single arbitrary-selector rule pads whichever
 * descendant actually scrolls, only below md.
 */
const DAY_SECONDS = 86400;

/** "Nightly-ish" without a scheduler — checked once per app load, not on a timer, matching how every other "keep this fresh" mechanism in this app (claim buttons, task periods, budget status) is computed/triggered on read rather than backgrounded. */
function useOpportunisticSync() {
  const { data: status } = useSyncStatus();
  const runSync = useRunCommunitySync();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current || status === undefined) return;
    firedRef.current = true;
    const staleEnough = !status.lastRun || Date.now() / 1000 - status.lastRun.createdAt > DAY_SECONDS;
    if (staleEnough) runSync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
}

export function Shell() {
  useOpportunisticSync();
  return (
    <div className="min-h-screen flex text-[13px]">
      <div className="hidden md:flex w-[62px] shrink-0 bg-black/40 border-r border-border2 flex-col items-center py-3 gap-1.5">
        <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-amber to-pink grid place-items-center font-display font-bold text-[13px] text-ink mb-2">
          A
        </div>
        {railIcons}
        <div className="flex-1" />
        {pinnedIcons}
      </div>
      <div className="flex-1 min-w-0 [&_.overflow-y-auto]:pb-16 md:[&_.overflow-y-auto]:pb-0">
        <Outlet />
      </div>
      <div className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-[#080a0e]/95 backdrop-blur border-t border-border2 flex items-center justify-around px-1 py-1">
        {railIcons}
        {pinnedIcons}
      </div>
    </div>
  );
}
