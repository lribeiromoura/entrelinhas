import { betterAuth } from "better-auth";
import { authDatabase } from "./db";
import { secret, publicOrigin } from "./settings";
export const auth = betterAuth({
  database: authDatabase,
  telemetry: { enabled: false },
  secret,
  baseURL: publicOrigin,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
});
