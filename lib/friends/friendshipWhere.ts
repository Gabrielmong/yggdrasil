import type { Prisma } from "@prisma/client";

/** Prisma `where` clause matching the Friendship row between two users,
 * regardless of which one is the requester — every "are these two users
 * friends" check in this codebase goes through this helper so the
 * direction-agnostic logic lives in exactly one place. */
export function symmetricPairWhere(userAId: string, userBId: string): Prisma.FriendshipWhereInput {
  return {
    OR: [
      { requesterId: userAId, addresseeId: userBId },
      { requesterId: userBId, addresseeId: userAId },
    ],
  };
}
