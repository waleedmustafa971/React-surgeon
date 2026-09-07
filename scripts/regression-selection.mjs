import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Agent,config,LlamaCppProvider,cleanup} from '../packages/core/dist/index.js';
const demo=path.resolve('examples/buggy-react-app');
const root=path.resolve('dist/stale-selection-regression');
await fs.mkdir(root,{recursive:true});
for(const name of ['src','scenarios','package.json','tsconfig.json','vite.config.ts','index.html'])await fs.cp(path.join(demo,name),path.join(root,name),{recursive:true});
await fs.copyFile(path.join(demo,'fixtures/ProductCard.tsx.txt'),path.join(root,'src/components/ProductCard.tsx'));
const settings=await config(root);settings.model=(await config(demo)).model;settings.model.port=18091;settings.appURL='http://127.0.0.1:5273';
await fs.writeFile(path.join(root,'.react-surgeon/config.json'),JSON.stringify(settings));
const scenario=JSON.parse(await fs.readFile(path.join(root,'scenarios/cart.json'),'utf8'));scenario.baseURL=settings.appURL;
const model=new LlamaCppProvider(root,settings.model);
try{
 const proof=await new Agent(root,model,console.log).fix('Each click should add one item',scenario,{file:'src/components/Login.tsx',line:28,column:9,role:'button',name:'Sign in',text:'Sign in',route:'/login'});
 assert.equal(proof.status,'VERIFIED');assert.equal(proof.baseline.source.file,'src/components/ProductCard.tsx');assert.deepEqual(proof.changes.map(c=>c.path),['src/components/ProductCard.tsx']);
 console.log('PASS: exact task, stale login selection, real Qwen repair and all verification checks.');
}finally{await model.stop();await cleanup();}
