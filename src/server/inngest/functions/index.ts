import { syncUserCreated, syncUserDeleted, syncUserUpdated } from "./sync-user";

export const functions = [syncUserCreated, syncUserUpdated, syncUserDeleted];
