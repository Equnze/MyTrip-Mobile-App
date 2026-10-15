import { serve } from "inngest/edge";

import { inngest } from "@/server/inngest/client";
import { functions } from "@/server/inngest/functions";

const handler = serve({ client: inngest, functions });

export { handler as GET, handler as POST, handler as PUT };
