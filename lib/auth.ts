import { betterAuth } from "better-auth";
import { db, secret } from "./db";
export const auth = betterAuth({
  database: db,
  telemetry: { enabled: false },
  secret,
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3000",
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
});
