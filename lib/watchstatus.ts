export type WatchStatus = "watching" | "completed";

export type EngineAction =
  | {
      type: "markEpisode";
      distinctWatched: number;
      total: number | null;
    }
  | {
      type: "removeEpisode";
      distinctWatched: number;
      total: number | null;
    }
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
      if (current === "watching") {
        if (action.total != null && action.distinctWatched >= action.total) {
          return { from: current, to: "completed", reason: "auto_completed" };
        }
        return null;
      }
      return null;
    }

    case "removeEpisode": {
      if (
        current === "completed" &&
        action.total != null &&
        action.distinctWatched < action.total
      ) {
        return { from: current, to: "watching", reason: "user_status_change" };
      }
      return null;
    }

    case "setStatus": {
      if (action.to === current) return null;
      return { from: current, to: action.to, reason: "user_status_change" };
    }
  }
}
