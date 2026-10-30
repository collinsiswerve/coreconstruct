import {readFileSync,writeFileSync,mkdirSync,rmSync,readdirSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'..');
export function moduleLoader(fixture={}){
 globalThis.__coreconstructTestFixture=fixture;
 const target=resolve(root,'.test-runtime',crypto.randomUUID());mkdirSync(target,{recursive:true});
 process.on('exit',()=>rmSync(target,{recursive:true,force:true}));const compiled=new Map();
 function build(file){file=resolve(root,file);if(compiled.has(file))return compiled.get(file);const out=resolve(target,relative(root,file).replace(/\.tsx?$/,'.mjs'));compiled.set(file,out);mkdirSync(dirname(out),{recursive:true});
 let source=file.endsWith('/app/chatgpt-auth.ts')?'export const getChatGPTUser=async()=>globalThis.__coreconstructTestFixture.user;':readFileSync(file,'utf8');
 source=source.replace(/import\s*\{\s*env\s*\}\s*from\s*['"]cloudflare:workers['"];?/g,'const env=globalThis.__coreconstructTestFixture.env;');
 let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 js=js.replace(/(from\s*['"])(\.[^'"]+)(['"])/g,(_,a,spec,b)=>{let dep=resolve(dirname(file),spec);if(!existsSync(dep))dep+=existsSync(dep+'.ts')?'.ts':'.tsx';return a+pathToFileURL(build(dep)).href+b;});writeFileSync(out,js);return out;
 }
 return file=>import(pathToFileURL(build(file)).href);
}
export function databaseFixture(){const db=new DatabaseSync(':memory:');for(const f of readdirSync(resolve(root,'drizzle')).filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync(resolve(root,'drizzle',f),'utf8'));const objects=new Map();
 const fixture={user:null,db,conflict:false,objects,env:{DATA_ENCRYPTION_KEY:'12'.repeat(32)}};
 const prep=(sql,values=[])=>({sql,values,bind(...v){return prep(sql,v);},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){if(fixture.conflict&&sql.startsWith('UPDATE workspaces')){db.exec('UPDATE workspaces SET version=version+1');fixture.conflict=false;}return {meta:{changes:Number(db.prepare(sql).run(...values).changes)}};}});
 fixture.env.DB={prepare:prep,async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
 fixture.env.BUCKET={async put(key,bytes){objects.set(key,new Uint8Array(bytes));},async get(key){const bytes=objects.get(key);return bytes?{body:bytes.slice(),arrayBuffer:async()=>bytes.slice().buffer}:null;},async delete(key){objects.delete(key);}};return fixture;
}
export const command=(type,payload,id=crypto.randomUUID())=>({id,type,payload});
export const request=(path='/api/workspace',body,organizationId,origin='https://pilot.example')=>new Request('https://pilot.example'+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json',...(origin?{Origin:origin}:{})}:{}),...(organizationId?{'x-organization-id':organizationId}:{})},...(body?{body:JSON.stringify(body)}:{})});
