import { userSessions } from "@repo/database/api-schema";
import { eq, lt } from "drizzle-orm";
import type { Session } from "narvik";
import { Narvik } from "narvik";
import { db } from "../db";

export const narvik = new Narvik({
  data: {
    saveSession: async (session: Session) => {
      await db.insert(userSessions).values({
        id: session.id,
        userId: session.userId,
        expiresAt: session.expiresAt.getTime(),
      });
    },
    fetchSession: async (sessionId: string) => {
      const [row] = await db
        .select()
        .from(userSessions)
        .where(eq(userSessions.id, sessionId))
        .limit(1);
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        userId: row.userId,
        expiresAt: new Date(row.expiresAt),
      };
    },
    updateSessionExpiry: async (sessionId: string, updatedExpiresAt: Date) => {
      await db
        .update(userSessions)
        .set({ expiresAt: updatedExpiresAt.getTime() })
        .where(eq(userSessions.id, sessionId));
    },
    deleteSession: async (sessionId: string) => {
      await db.delete(userSessions).where(eq(userSessions.id, sessionId));
    },
    deleteSessionsForUser: async (userId: string) => {
      await db.delete(userSessions).where(eq(userSessions.userId, userId));
    },
    deleteAllExpiredSessions: async () => {
      await db
        .delete(userSessions)
        .where(lt(userSessions.expiresAt, Date.now()));
    },
  },
  cookie: {
    attributes: {
      secure: false,
      sameSite: "none",
      path: "/",
    },
  },
});
