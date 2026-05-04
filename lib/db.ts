import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { seedDatabase } from "@/lib/seed-data";

const dbDirectory = path.join(process.cwd(), "db");
const databasePath = path.join(dbDirectory, "kg-3dpm.sqlite");
const schemaPath = path.join(dbDirectory, "schema.sql");

let database: Database.Database | null = null;

export function getDb() {
  if (database) {
    return database;
  }

  fs.mkdirSync(dbDirectory, { recursive: true });
  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.exec(fs.readFileSync(schemaPath, "utf8"));
  seedDatabase(database);

  return database;
}

export { databasePath };
