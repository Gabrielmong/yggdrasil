export type ActivityEventType = "STARTED_READING" | "FINISHED" | "RATED";

export interface ActivityEventDraft {
  type: ActivityEventType;
  rating?: number;
}

interface UserBookState {
  status: "WANT_TO_READ" | "READING" | "READ" | null;
  rating: number | null;
}

interface NextUserBookState {
  status: "WANT_TO_READ" | "READING" | "READ";
  rating: number | null;
}

/** Diffs a UserBook's previous and next status/rating to decide which
 * activity events a mutation should record. Pure — callers persist the
 * returned drafts as ActivityEvent rows; this function never touches the
 * database. A single mutation can produce more than one event (e.g.
 * marking a book read with a rating in the same request). */
export function activityEventsFor(prev: UserBookState, next: NextUserBookState): ActivityEventDraft[] {
  const events: ActivityEventDraft[] = [];

  if (next.status === "READING" && prev.status !== "READING") {
    events.push({ type: "STARTED_READING" });
  }
  if (next.status === "READ" && prev.status !== "READ") {
    events.push({ type: "FINISHED" });
  }
  if (next.rating != null && next.rating !== prev.rating) {
    events.push({ type: "RATED", rating: next.rating });
  }

  return events;
}
