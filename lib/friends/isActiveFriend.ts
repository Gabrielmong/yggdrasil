import { prisma } from "@/lib/prisma";
import { symmetricPairWhere } from "@/lib/friends/friendshipWhere";

/** True when `userId` and `otherUserId` have an ACCEPTED friendship AND
 * `otherUserId`'s account is still active. Every friend-scoped route
 * (books/profile/stats/compare) uses this single check so a deactivated
 * user disappears from a friend's view uniformly — the underlying
 * Friendship row is never touched, so reactivating the user restores
 * access immediately. */
export async function isActiveFriend(userId: string, otherUserId: string): Promise<boolean> {
  const [friendship, otherUser] = await Promise.all([
    prisma.friendship.findFirst({ where: { ...symmetricPairWhere(userId, otherUserId), status: "ACCEPTED" } }),
    prisma.user.findUnique({ where: { id: otherUserId }, select: { active: true } }),
  ]);
  return Boolean(friendship) && Boolean(otherUser?.active);
}
