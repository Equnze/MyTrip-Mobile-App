import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// Neon's HTTP driver works in both Node (local dev) and the Workers runtime (EAS Hosting).
export const db = drizzle(process.env.DATABASE_URL!, { schema });
