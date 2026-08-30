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
  | {
      type: "removeEpisode";
      distinctWatched: number;
      total: number | null;
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
      if (current === "watching") {
        if (action.total != null && action.distinctWatched >= action.total) {
          return { from: current, to: "completed", reason: "auto_completed" };
        }
        return null;
      }
      // A paused entry resumes to watching when the user watches again. If the
      // resumed watch happens to complete the series, go straight to completed.
      if (current === "paused") {
        if (action.total != null && action.distinctWatched >= action.total) {
          return { from: current, to: "completed", reason: "auto_completed" };
        }
        return { from: current, to: "watching", reason: "user_status_change" };
      }
      return null;
    }

    case "removeEpisode": {
      // Removing an episode can only take an entry out of `completed` (back to
      // `watching`) when the watched set is no longer complete. Other statuses
      // are unaffected; removing the last episode is handled by the caller
      // (the WatchEntry is dropped entirely).
      if (
        current === "completed" &&
        action.total != null &&
        action.distinctWatched < action.total
      ) {
        return { from: current, to: "watching", reason: "user_status_change" };
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
