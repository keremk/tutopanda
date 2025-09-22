import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "dotenv";

config({ path: ".env" }); // or .env.local

const sql = postgres(process.env.DATABASE_URL!);
export const db = drizzle({ client: sql });
