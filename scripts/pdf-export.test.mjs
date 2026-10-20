import { test } from 'node:test';
import assert from 'node:assert/strict';
import pdfExport from '../lib/pdf-export.ts';
const { selectPdfContent } = pdfExport;
test('PDF respeita livros escolhidos, lixeira, dependências e tipo de foto', () => {
  const metadata = {
    books: [{ id:'a',deleted_at:null },{ id:'b',deleted_at:null },{ id:'c',deleted_at:1 }],
    ideas: [{ id:'i',book:'a',deleted_at:null },{ id:'j',book:'b',deleted_at:null },{ id:'k',book:'a',deleted_at:1 }],
    questions: [{ id:'q',book:'a',deleted_at:null },{ id:'r',book:'b',deleted_at:null }],
    photos: [{ id:'note',book:'a',kind:'note',deleted_at:null },{ id:'cover',book:'a',kind:'cover',deleted_at:null },{ id:'hidden',book:'a',kind:'note',deleted_at:1 },{ id:'other',book:'b',kind:'note',deleted_at:null }],
    connections: [{ id:'x',source:'i',target:'j',deleted_at:null },{ id:'y',source:'i',target:'k',deleted_at:null }],
  };
  const onlySummary = selectPdfContent(metadata,{ bookIds:['a','c'],sections:['summary'] });
  assert.deepEqual(onlySummary.books.map(x=>x.id),['a']);
  assert.deepEqual(onlySummary.photos,[]);
  assert.deepEqual(onlySummary.connections,[]);
  const withPictures = selectPdfContent(metadata,{ bookIds:['a'],sections:['photos','covers'] });
  assert.deepEqual(withPictures.photos.map(x=>x.id),['note','cover']);
  assert.deepEqual(withPictures.questions.map(x=>x.id),['q']);
});
