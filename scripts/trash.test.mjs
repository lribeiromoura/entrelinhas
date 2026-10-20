import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { postgresParameters } from '../lib/sql-parameters.ts';
import { createTrashService, trashRetentionMs } from '../lib/trash-service.ts';
async function fixture(mode) {
  if (mode === 'postgres') {
    const raw = new PGlite();
    await raw.exec('CREATE TABLE "user"(id TEXT PRIMARY KEY);INSERT INTO "user" VALUES(\'ana\'),(\'bruno\')');
    await raw.exec(readFileSync('supabase/app-schema.sql','utf8'));
    const adapt = q => ({ all: async (s,...a)=>(await q.query(postgresParameters(s),a)).rows, get: async(s,...a)=>(await q.query(postgresParameters(s),a)).rows[0], run: async(s,...a)=>{await q.query(postgresParameters(s),a);}, transaction: fn=>raw.transaction(tx=>fn(adapt(tx))) });
    return { db: adapt(raw), close: ()=>raw.close() };
  }
  const raw = new Database(':memory:'); raw.pragma('foreign_keys=ON');
  raw.exec(`CREATE TABLE books(id TEXT PRIMARY KEY,owner TEXT,title TEXT,author TEXT,summary TEXT,cover_photo TEXT,deleted_at INTEGER);
    CREATE TABLE ideas(id TEXT PRIMARY KEY,owner TEXT,book TEXT REFERENCES books(id),title TEXT,description TEXT,deleted_at INTEGER);
    CREATE TABLE questions(id TEXT PRIMARY KEY,owner TEXT,book TEXT REFERENCES books(id),prompt TEXT,answer TEXT,due INTEGER,deleted_at INTEGER);
    CREATE TABLE photos(id TEXT PRIMARY KEY,owner TEXT,book TEXT REFERENCES books(id),mime TEXT,bytes BLOB,storage_path TEXT,deleted_at INTEGER);
    CREATE TABLE connections(id TEXT PRIMARY KEY,owner TEXT,source TEXT REFERENCES ideas(id),target TEXT REFERENCES ideas(id),deleted_at INTEGER);
    CREATE TABLE storage_deletions(id TEXT PRIMARY KEY,owner TEXT,storage_path TEXT);`);
  const db={all:async(s,...a)=>raw.prepare(s).all(...a),get:async(s,...a)=>raw.prepare(s).get(...a),run:async(s,...a)=>{raw.prepare(s).run(...a);},transaction:async fn=>{raw.exec('BEGIN');try{const r=await fn(db);raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};
  return {db,close:()=>raw.close()};
}
for (const mode of ['sqlite','postgres']) test(`Lixeira ${mode}: exclusão restrita, cascata, prazo e retomada das imagens`,async()=>{
  const {db,close}=await fixture(mode), now=Date.now(), removed=[];
  let fail=true;
  const service=createTrashService(db,async path=>{if(fail)throw Error('storage offline'); removed.push(path);});
  try {
    for(const [id,owner,deleted] of [['a','ana',now],['b','ana',null],['foreign','bruno',now],['expired','ana',now-trashRetentionMs],['recent','ana',now-trashRetentionMs+1]])
      await db.run('INSERT INTO books(id,owner,title,author,deleted_at) VALUES(?,?,?,?,?)',id,owner,id,'Autor',deleted);
    await db.run('INSERT INTO ideas(id,owner,book,title,description) VALUES(?,?,?,?,?)','i','ana','a','I','D');
    await db.run('INSERT INTO ideas(id,owner,book,title,description) VALUES(?,?,?,?,?)','j','ana','b','J','D');
    await db.run('INSERT INTO connections(id,owner,source,target) VALUES(?,?,?,?)','c','ana','i','j');
    await db.run('INSERT INTO photos(id,owner,book,mime,storage_path) VALUES(?,?,?,?,?)','p','ana','a','image/jpeg','ana/p');
    await db.run('INSERT INTO questions(id,owner,book,prompt,answer,due) VALUES(?,?,?,?,?,?)','q','ana','a','P','R',now);
    await assert.rejects(()=>service.purge('ana','book','foreign'));
    await assert.rejects(()=>service.purge('ana','book','b'));
    await assert.rejects(()=>service.purge('ana','books; DROP TABLE books','a'));
    await service.purge('ana','book','a');
    for(const table of ['ideas','photos','questions','connections']) assert.equal((await db.all(`SELECT * FROM ${table} WHERE id<>?`,'j')).length,0);
    assert.ok(await db.get('SELECT id FROM ideas WHERE id=?','j'));
    assert.equal((await db.all('SELECT * FROM storage_deletions')).length,1);
    fail=false; await service.flush('ana');
    assert.deepEqual(removed,['ana/p']); assert.equal((await db.all('SELECT * FROM storage_deletions')).length,0);
    await service.expire('ana',now);
    assert.equal(await db.get('SELECT id FROM books WHERE id=?','expired'),undefined);
    assert.ok(await db.get('SELECT id FROM books WHERE id=?','recent'));
    assert.ok(await db.get('SELECT id FROM books WHERE id=?','foreign'));
    await service.sweep(); // Sweep also covers all owners with expired data.
    assert.ok(await db.get('SELECT id FROM books WHERE id=?','b'));
  } finally { await close(); }
});
