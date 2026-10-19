import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=readFileSync(new URL('../github-repository-card-open-counts.user.js',import.meta.url),'utf8');
function helpers(raw=null) {
 const document={parentNode:null,isConnected:true};
 const context={document,GM_getValue:()=>'',sessionStorage:{getItem:()=>raw}};
 // Expose hoisted pure helpers before browser bootstrap; production stays a
 // standalone userscript without a test-only global or module export.
 runInNewContext(source.replace('  registerTokenMenu();','  globalThis.helpers = {coalesceScanRoots,readCache}; return;'),context);
 return {document,...context.helpers};
}
test('cache rejects malformed counts, preserves valid zero counts',()=>{
 for(const counts of [null,{}, {openIssues:-1,openPulls:0},{openIssues:0,openPulls:'2'}]) {
  assert.equal(helpers(JSON.stringify({fetchedAt:Date.now(),counts})).readCache('fixture'),null);
 }
 const cache=helpers(JSON.stringify({fetchedAt:Date.now(),counts:{openIssues:0,openPulls:3}})).readCache('fixture');
 assert.equal(cache.counts.openIssues,0);assert.equal(cache.counts.openPulls,3);
});
test('coalescing retains connected outermost roots in input order',()=>{
 const {document,coalesceScanRoots}=helpers();
 const a={isConnected:true,parentNode:document};
 const b={isConnected:true,parentNode:a};
 const c={isConnected:true,parentNode:document};
 const detached={isConnected:false,parentNode:null};
 assert.deepEqual(Array.from(coalesceScanRoots(new Set([b,c,a,detached]))),[c,a]);
 assert.deepEqual(Array.from(coalesceScanRoots(new Set([b,c,a,document]))),[document]);
});
