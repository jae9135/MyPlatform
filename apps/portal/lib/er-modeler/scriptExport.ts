import type { GeneratedScript } from "./ExportDialog";

function escapeSqlComment(text: string): string {
  return text.replace(/'/g, "''");
}

export function buildDatabaseSql(dbName: string): string {
  const db = dbName.trim() || "dbm";
  return [
    "-- Database creation script",
    "-- Connect to 'postgres' database before running",
    "",
    `-- Database: ${db}`,
    `CREATE DATABASE ${db}`,
    "    WITH ENCODING 'UTF8'",
    "         TEMPLATE template0;",
    "",
  ].join("\n");
}

export function buildSchemaSql(schema: string, dbName: string): string {
  const sch = schema.trim() || "db1";
  const db = dbName.trim() || "dbm";
  return [
    "-- Schema creation script",
    `-- Target database: ${db}`,
    "-- Connect to target database before running",
    "",
    `CREATE SCHEMA IF NOT EXISTS ${sch};`,
    "",
  ].join("\n");
}

/** Apply schema.table qualification to DDL text from any API version. */
export function qualifyDdlContent(
  content: string,
  schema: string,
  dbName: string
): string {
  const sch = schema.trim() || "db1";
  const db = dbName.trim() || "dbm";
  const lower = content.toLowerCase();

  if (lower.includes("create database") || lower.startsWith("-- database creation")) {
    return content;
  }
  if (
    lower.includes("create schema") &&
    !lower.includes("create table")
  ) {
    return content;
  }

  if (new RegExp(`create table if not exists\\s+${sch}\\.`, "i").test(content)) {
    return content;
  }

  let out = content;

  if (!out.includes("-- Database:")) {
    out = out.replace(
      /^(-- Table:)/m,
      `-- Database: ${db}\n-- Schema: ${sch}\n$1`
    );
  }

  out = out.replace(
    /CREATE TABLE IF NOT EXISTS\s+(?!([a-z0-9_]+\.))([a-z0-9_]+)/gi,
    `CREATE TABLE IF NOT EXISTS ${sch}.$2`
  );
  out = out.replace(
    /COMMENT ON TABLE\s+(?!([a-z0-9_]+\.))([a-z0-9_]+)/gi,
    `COMMENT ON TABLE ${sch}.$2`
  );
  out = out.replace(
    /COMMENT ON COLUMN\s+(?!([a-z0-9_]+\.))([a-z0-9_]+)\./gi,
    `COMMENT ON COLUMN ${sch}.$2.`
  );
  out = out.replace(
    /\bON\s+(?!([a-z0-9_]+\.))([a-z0-9_]+)\s*\(/gi,
    `ON ${sch}.$2 (`
  );
  out = out.replace(
    /ALTER TABLE\s+(?!([a-z0-9_]+\.))([a-z0-9_]+)/gi,
    `ALTER TABLE ${sch}.$2`
  );
  out = out.replace(
    /REFERENCES\s+(?!([a-z0-9_]+\.))([a-z0-9_]+)\s*\(/gi,
    `REFERENCES ${sch}.$2 (`
  );

  return out;
}

export function enrichExportScripts(
  scripts: GeneratedScript[],
  dbName: string,
  schema: string
): GeneratedScript[] {
  const db = dbName.trim() || "dbm";
  const sch = schema.trim() || "db1";

  const enriched = scripts.map((script) => ({
    name: script.name,
    content: qualifyDdlContent(script.content, sch, db),
  }));

  const names = new Set(enriched.map((s) => s.name.toLowerCase()));
  const result = [...enriched];

  if (!names.has("00_database.sql")) {
    result.unshift({
      name: "00_database.sql",
      content: buildDatabaseSql(db),
    });
  }
  if (!names.has("01_schema.sql")) {
    const idx = result.findIndex((s) => s.name.toLowerCase() === "00_database.sql");
    result.splice(idx >= 0 ? idx + 1 : 0, 0, {
      name: "01_schema.sql",
      content: buildSchemaSql(sch, db),
    });
  }

  return result;
}

export function scriptSummaryLine(dbName: string, schema: string): string {
  return `DB ${escapeSqlComment(dbName)} · 스키마 ${escapeSqlComment(schema)}`;
}
