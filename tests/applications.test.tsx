import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { Pool } from "pg";
import { renderToStaticMarkup } from "react-dom/server";
import { SavedApplicationForm } from "../app/applications/saved-form";
import { fixture } from "./submission.test";

async function main() {
  const snapshot = structuredClone(fixture);
  snapshot.answers["0-3-0"] = "1";
  snapshot.freeText["0-3-0:1"] = "Rust";
  const html = renderToStaticMarkup(<SavedApplicationForm id="saved" snapshot={snapshot} files={[{ id: "file", fieldId: "0-2-0", filename: "original.pdf" }]} />);
  assert.match(html, /value="Test"/);
  assert.match(html, /A short cover letter\./);
  assert.match(html, /value="Rust"/);
  assert.match(html, /value="1" selected=""/);
  assert.match(html, /original.pdf/);
  assert.match(html, /\/api\/applications\/saved\/files\/file/);
  for (const field of html.matchAll(/<(?:input|textarea|select)\b[^>]*>/g)) assert.match(field[0], /disabled=""/);
  assert.doesNotMatch(html, /type="submit"/);

  config({ path: ".env.local", quiet: true });
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `applications_test_${randomUUID().replaceAll("-", "")}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  const { db, pool } = await import("../lib/db");
  try {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db, { migrationsFolder: "drizzle" });
    const { user, submission, submissionFile } = await import("../lib/db/schema");
    const { listApplications, getApplication, getApplicationFile } = await import("../lib/applications/data");
    const owner = randomUUID(), other = randomUUID();
    await db.insert(user).values([owner, other].map(id => ({ id, name: "Test", email: `${id}@example.invalid` })));
    const [record] = await db.insert(submission).values({ userId: owner, sourceURL: snapshot.job.sourceURL, snapshot, status: "submitted" }).returning();
    const bytes = Buffer.from("Saved attachment");
    const [file] = await db.insert(submissionFile).values({ submissionId: record.id, fieldId: "0-2-0", filename: "original.pdf", contentType: "application/pdf", content: bytes }).returning();
    assert.deepEqual(await listApplications(other), []);
    assert.equal((await listApplications(owner))[0].title, snapshot.job.title);
    assert.equal((await listApplications(owner))[0].status, "submitted");
    assert.equal(await getApplication(other, record.id), null);
    assert.equal(await getApplication(owner, randomUUID()), null);
    const saved = await getApplication(owner, record.id);
    assert.deepEqual(saved?.snapshot.answers, snapshot.answers);
    assert.deepEqual(saved?.snapshot.freeText, snapshot.freeText);
    assert.equal(saved?.files[0].filename, "original.pdf");
    assert.equal(await getApplicationFile(other, record.id, file.id), null);
    assert.equal(await getApplicationFile(owner, randomUUID(), file.id), null);
    assert.deepEqual((await getApplicationFile(owner, record.id, file.id))?.content, bytes);
    const { GET } = await import("../app/api/applications/[id]/files/[fileId]/route");
    assert.equal((await GET(new Request("http://localhost:3000/api/applications/test/files/test"), { params: Promise.resolve({ id: record.id, fileId: file.id }) })).status, 401);
    console.log("PASS: saved disabled fields, option/free-text answers, attachment links, database snapshots, owner isolation, exact attachment bytes, and unauthenticated download rejection.");
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Applications test failed"); process.exitCode = 1; });
