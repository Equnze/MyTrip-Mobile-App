import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";

import { inngest } from "../client";
import { clerkUserCreated, clerkUserDeleted, clerkUserUpdated } from "../events";

export const syncUserCreated = inngest.createFunction(
  { id: "sync-user-created", triggers: clerkUserCreated },
  async ({ event, step }) => {
    const { id, email, firstName, lastName, imageUrl } = event.data;

    // Idempotent: Clerk can deliver the same webhook more than once.
    await step.run("insert-user", () =>
      db
        .insert(users)
        .values({ id, email, firstName, lastName, imageUrl })
        .onConflictDoNothing({ target: users.id }),
    );

    return { userId: id };
  },
);

export const syncUserUpdated = inngest.createFunction(
  { id: "sync-user-updated", triggers: clerkUserUpdated },
  async ({ event, step }) => {
    const { id, email, firstName, lastName, imageUrl } = event.data;

    // Upsert: webhooks can arrive out of order, so an update may land before the create.
    await step.run("upsert-user", () =>
      db
        .insert(users)
        .values({ id, email, firstName, lastName, imageUrl })
        .onConflictDoUpdate({
          target: users.id,
          set: { email, firstName, lastName, imageUrl, updatedAt: new Date() },
        }),
    );

    return { userId: id };
  },
);

export const syncUserDeleted = inngest.createFunction(
  { id: "sync-user-deleted", triggers: clerkUserDeleted },
  async ({ event, step }) => {
    const { id } = event.data;

    // Idempotent: deleting a user that is already gone is a no-op.
    await step.run("delete-user", () => db.delete(users).where(eq(users.id, id)));

    return { userId: id };
  },
);
