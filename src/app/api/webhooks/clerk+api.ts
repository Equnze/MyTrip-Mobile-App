import type { UserJSON } from "@clerk/backend";
import { verifyWebhook } from "@clerk/backend/webhooks";

import { inngest } from "@/server/inngest/client";
import { clerkUserCreated, clerkUserDeleted, clerkUserUpdated } from "@/server/inngest/events";

// Public route: Clerk calls it directly, so it is authenticated by the webhook signature
// (CLERK_WEBHOOK_SIGNING_SECRET), not by a user session.
export async function POST(request: Request) {
  let evt;
  try {
    evt = await verifyWebhook(request);
  } catch {
    return Response.json(
      { error: { code: "INVALID_SIGNATURE", message: "Webhook verification failed" } },
      { status: 400 },
    );
  }

  // The delivery id is reused when Clerk retries, so Inngest dedupes repeated deliveries.
  const deliveryId = request.headers.get("svix-id") ?? request.headers.get("webhook-id") ?? undefined;
  const options = { id: deliveryId };

  let event;
  switch (evt.type) {
    case "user.created":
      event = clerkUserCreated.create(toUserData(evt.data), options);
      break;
    case "user.updated":
      event = clerkUserUpdated.create(toUserData(evt.data), options);
      break;
    case "user.deleted":
      if (!evt.data.id) return new Response(null, { status: 204 });
      event = clerkUserDeleted.create({ id: evt.data.id }, options);
      break;
    default:
      return new Response(null, { status: 204 });
  }

  try {
    await inngest.send(event);
  } catch (err) {
    console.error(`Failed to send ${evt.type} to Inngest`, err);
    // A 5xx makes Clerk retry the delivery later.
    return Response.json(
      { error: { code: "QUEUE_UNAVAILABLE", message: "Could not enqueue user sync" } },
      { status: 500 },
    );
  }

  return new Response(null, { status: 202 });
}

function toUserData(user: UserJSON) {
  const primaryEmail = user.email_addresses.find((e) => e.id === user.primary_email_address_id);
  return {
    id: user.id,
    email: primaryEmail?.email_address ?? null,
    firstName: user.first_name,
    lastName: user.last_name,
    imageUrl: user.image_url ?? null,
  };
}
