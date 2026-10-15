import { eventType } from "inngest";
import { z } from "zod";

// Only the fields we store are forwarded from Clerk's webhook payload.
const clerkUserSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  imageUrl: z.string().nullable(),
});

export const clerkUserCreated = eventType("clerk/user.created", { schema: clerkUserSchema });

export const clerkUserUpdated = eventType("clerk/user.updated", { schema: clerkUserSchema });

export const clerkUserDeleted = eventType("clerk/user.deleted", {
  schema: z.object({ id: z.string() }),
});
