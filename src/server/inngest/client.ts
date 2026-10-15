import { Inngest } from "inngest";

// Dev only for now: INNGEST_DEV=1 in .env points the SDK at the local Inngest Dev Server,
// so no event or signing keys are needed.
export const inngest = new Inngest({ id: "mytrip" });
