import { describe, it, expect } from "vitest";
import { activityEventsFor } from "@/lib/activity/recordActivityEvents";

describe("activityEventsFor", () => {
  it("emits STARTED_READING when status moves into READING", () => {
    const events = activityEventsFor(
      { status: "WANT_TO_READ", rating: null },
      { status: "READING", rating: null }
    );
    expect(events).toEqual([{ type: "STARTED_READING" }]);
  });

  it("emits FINISHED when status moves into READ", () => {
    const events = activityEventsFor(
      { status: "READING", rating: null },
      { status: "READ", rating: null }
    );
    expect(events).toEqual([{ type: "FINISHED" }]);
  });

  it("emits both FINISHED and RATED when a book is marked read with a rating in one update", () => {
    const events = activityEventsFor(
      { status: "READING", rating: null },
      { status: "READ", rating: 5 }
    );
    expect(events).toEqual([{ type: "FINISHED" }, { type: "RATED", rating: 5 }]);
  });

  it("emits only RATED when re-rating an already-READ book", () => {
    const events = activityEventsFor(
      { status: "READ", rating: 3 },
      { status: "READ", rating: 4 }
    );
    expect(events).toEqual([{ type: "RATED", rating: 4 }]);
  });

  it("emits nothing for a no-op update (e.g. editing notes only)", () => {
    const events = activityEventsFor(
      { status: "READ", rating: 4 },
      { status: "READ", rating: 4 }
    );
    expect(events).toEqual([]);
  });

  it("does not re-emit STARTED_READING when status stays READING", () => {
    const events = activityEventsFor(
      { status: "READING", rating: null },
      { status: "READING", rating: null }
    );
    expect(events).toEqual([]);
  });

  it("treats a null prev (brand new UserBook) as no prior status", () => {
    const events = activityEventsFor(
      { status: null, rating: null },
      { status: "READING", rating: null }
    );
    expect(events).toEqual([{ type: "STARTED_READING" }]);
  });

  it("does not emit RATED when rating is cleared back to null", () => {
    const events = activityEventsFor(
      { status: "READ", rating: 4 },
      { status: "READ", rating: null }
    );
    expect(events).toEqual([]);
  });
});
