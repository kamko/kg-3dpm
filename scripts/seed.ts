import { getDb } from "../lib/db";
import { databasePath } from "../lib/db";
import { seedDatabase } from "../lib/seed-data";

const db = getDb();
seedDatabase(db, { reset: true });

console.log(`Seeded database at ${databasePath}`);
