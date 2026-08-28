export type WatchStatus =
  | "plan_to_watch"
  | "watching"
  | "completed"
  | "paused"
  | "dropped";

export type EngineAction =
  | {
      type: "markEpisode";
      distinctWatched: number;
      total: number | null;
      firstWatch: boolean;
    }
  | { type: "timeTick"; daysSinceLastWatch: number; autoPauseEnabled: boolean }
  | { type: "setStatus"; to: WatchStatus };

export type Transition = {
  from: WatchStatus;
  to: WatchStatus;
  reason: string;
};

export function computeNextStatus(
  current: WatchStatus,
  action: EngineAction,
): Transition | null {
  switch (action.type) {
    case "markEpisode": {
      // First ever watch of a plan_to_watch entry starts watching.
      if (current === "plan_to_watch" && action.firstWatch) {
        return { from: current, to: "watching", reason: "user_status_change" };
      }
      // Watching an entry whose every cached episode is now watched completes it.
      if (
        current === "watching" &&
        action.total != null &&
        action.distinctWatched >= action.total
      ) {
        return { from: current, to: "completed", reason: "auto_completed" };
      }
      return null;
    }

    case "timeTick": {
      // Inactivity auto-pause, honouring the per-entry opt-out.
      if (
        current === "watching" &&
        action.autoPauseEnabled &&
        action.daysSinceLastWatch > 30
      ) {
        return { from: current, to: "paused", reason: "auto_paused" };
      }
      return null;
    }

    case "setStatus": {
      // Manual moves never auto-generate a transition to dropped; the engine
      // only ever emits dropped via this explicit user action.
      if (action.to === current) return null;
      const reason = action.to === "dropped" ? "user_dropped" : "user_status_change";
      return { from: current, to: action.to, reason };
    }
  }
}
