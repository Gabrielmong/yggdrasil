import { describe, it, expect } from "vitest";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";

describe("symmetricPairWhere", () => {
  it("matches either direction between two user ids", () => {
    expect(symmetricPairWhere("user-a", "user-b")).toEqual({
      OR: [
        { requesterId: "user-a", addresseeId: "user-b" },
        { requesterId: "user-b", addresseeId: "user-a" },
      ],
    });
  });

  it("is order-independent (same clause regardless of argument order, modulo array order)", () => {
    const ab = symmetricPairWhere("user-a", "user-b");
    const ba = symmetricPairWhere("user-b", "user-a");
    expect(ab.OR).toEqual(expect.arrayContaining(ba.OR!));
    expect(ba.OR).toEqual(expect.arrayContaining(ab.OR!));
  });
});
