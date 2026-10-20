import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { postgresParameters } from '../lib/sql-parameters.ts';
import { createSummaryVersions } from '../lib/summary-versions.ts';
async function setup(mode) {
  if (mode === 'postgres') {
    const raw=new PGlite(); await raw.exec('CREATE TABLE "user"(id TEXT PRIMARY KEY);INSERT INTO "user" VALUES(\'ana\'),(\'bruno\')');
    await raw.exec(readFileSync('supabase/app-schema.sql','utf8'));
    const adapt=q=>({all:async(s,...a)=>(await q.query(postgresParameters(s),a)).rows,get:async(s,...a)=>(await q.query(postgresParameters(s),a)).rows[0],run:async(s,...a)=>{await q.query(postgresParameters(s),a);},transaction:fn=>raw.transaction(tx=>fn(adapt(tx)))});
    return {db:adapt(raw),close:()=>raw.close()};
  }
  const raw=new Database(':memory:');raw.pragma('foreign_keys=ON');raw.exec("CREATE TABLE books(id TEXT PRIMARY KEY,owner TEXT,title TEXT,author TEXT,summary TEXT,deleted_at INTEGER);CREATE TABLE summary_versions(id TEXT PRIMARY KEY,owner TEXT,book TEXT REFERENCES books(id) ON DELETE CASCADE,summary TEXT,created_at INTEGER);");
  const db={all:async(s,...a)=>raw.prepare(s).all(...a),get:async(s,...a)=>raw.prepare(s).get(...a),run:async(s,...a)=>{raw.prepare(s).run(...a);},transaction:async fn=>{raw.exec('BEGIN');try{const value=await fn(db);raw.exec('COMMIT');return value;}catch(e){raw.exec('ROLLBACK');throw e;}}};
  return {db,close:()=>raw.close()};
}
for(const mode of ['sqlite','postgres'])test(`Versões ${mode}: legado, restauração sem perda, isolamento, paginação e rollback`,async()=>{
  const {db,close}=await setup(mode), service=createSummaryVersions(db);
  try {
    await db.run('INSERT INTO books(id,owner,title,author,summary) VALUES(?,?,?,?,?)','a','ana','Livro','Autor','Resumo legado');
    await db.run('INSERT INTO books(id,owner,title,author,summary) VALUES(?,?,?,?,?)','b','bruno','Outro','Autor','Privado');
    await service.save('ana','a','Primeira alteração');
    let list=await service.read('ana','a');assert.equal(list.items.length,2);
    const original=list.items[1], recent=list.currentId;
    assert.equal((await service.read('ana','a',original.id)).summary,'Resumo legado');
    await service.save('ana','a','Primeira alteração');assert.equal((await service.read('ana','a')).items.length,2);
    await service.save('ana','a',undefined,original.id);
    assert.equal((await db.get('SELECT summary FROM books WHERE id=?','a')).summary,'Resumo legado');
    assert.equal((await service.read('ana','a',recent)).summary,'Primeira alteração');
    assert.equal((await service.read('ana','a')).items.length,3);
    await assert.rejects(()=>service.read('bruno','a'));
    await assert.rejects(()=>service.read('bruno','b',original.id));
    await assert.rejects(()=>service.save('bruno','b',undefined,original.id));
    await assert.rejects(()=>service.save('ana','a','x'.repeat(100001)));
    const broken={...db,transaction:fn=>db.transaction(tx=>fn({...tx,run:async(s,...a)=>{if(s.startsWith('UPDATE books SET summary=?'))throw Error('Falha simulada');return tx.run(s,...a);}}))};
    await assert.rejects(()=>createSummaryVersions(broken).save('ana','a','Falha'),/simulada/);
    assert.equal((await service.read('ana','a')).items.length,3);
    for(let i=0;i<22;i++)await service.save('ana','a','Versão '+i);
    list=await service.read('ana','a');assert.equal(list.items.length,20);assert.equal(list.hasMore,true);
    assert.equal((await service.read('ana','a',undefined,20)).items.length,5);
    await db.run('UPDATE books SET deleted_at=? WHERE id=?',Date.now(),'a');
    await assert.rejects(()=>service.read('ana','a'));
    await assert.rejects(()=>service.save('ana','a','Não salvar'));
    await db.run('DELETE FROM books WHERE id=?','a');assert.equal((await db.all('SELECT * FROM summary_versions')).length,0);
  }finally{await close();}
});
