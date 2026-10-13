import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {packBackup,unpackBackup} from './encrypted-backup.mjs';
const age=process.env.AGE_BIN||'age';
const keygen=process.env.AGE_KEYGEN_BIN||(process.env.AGE_BIN?join(dirname(age),'age-keygen.exe'):'age-keygen');
const now=new Date('2026-10-13T05:00:00Z'),projectRef='kjnnguekhshkhgycmryl';
async function fixture(fn){
  const root=await mkdtemp(join(tmpdir(),'fs-encrypted-backup-'));
  try{
    const sourceDir=join(root,'source'),outDir=join(root,'sealed'),identity=join(root,'key');
    await mkdir(sourceDir);
    assert.equal(spawnSync(keygen,['-o',identity],{windowsHide:true,encoding:'utf8'}).status,0,'age-keygen must be installed (no silent skip)');
    const recipient=spawnSync(keygen,['-y',identity],{windowsHide:true,encoding:'utf8'}).stdout.trim();
    await writeFile(join(sourceDir,'full.dump'),'PGDMP-private-auth-test');
    await writeFile(join(sourceDir,'public.dump'),'PGDMP-private-schedule-test');
    await writeFile(join(sourceDir,'roles.sql'),'CREATE ROLE synthetic;');
    await writeFile(join(sourceDir,'inventory.json'),JSON.stringify({schemas:['auth','public','storage'],storageObjects:0}));
    await fn({root,sourceDir,outDir,identity,recipient,age,projectRef,now});
  }finally{await rm(root,{recursive:true,force:true});}
}
test('real age round-trip releases only ciphertext, exact payload recovered',()=>fixture(async ctx=>{
  const {file}=await packBackup(ctx);
  assert.deepEqual(await readdir(ctx.outDir),['database.tar.age']);
  assert.equal((await readFile(file)).includes(Buffer.from('private-auth-test')),false);
  const outDir=join(ctx.root,'restored');
  const manifest=await unpackBackup({...ctx,encrypted:file,outDir,now:now.getTime()});
  assert.equal(manifest.storageObjectsIncluded,false);
  assert.deepEqual(await readFile(join(outDir,'full.dump')),await readFile(join(ctx.sourceDir,'full.dump')));
}));
test('wrong identity rejects and leaves no plaintext',()=>fixture(async ctx=>{
  const {file}=await packBackup(ctx),identity=join(ctx.root,'wrong-key'),outDir=join(ctx.root,'bad');
  assert.equal(spawnSync(keygen,['-o',identity],{windowsHide:true}).status,0);
  await assert.rejects(unpackBackup({...ctx,identity,encrypted:file,outDir,now:now.getTime()}),/tool failed/);
  assert.deepEqual(await readdir(outDir),[]);
}));
test('tampered ciphertext is rejected without plaintext output',()=>fixture(async ctx=>{
  const {file}=await packBackup(ctx),bytes=await readFile(file),outDir=join(ctx.root,'bad');
  bytes[bytes.length-1]^=1;await writeFile(file,bytes);
  await assert.rejects(unpackBackup({...ctx,encrypted:file,outDir,now:now.getTime()}),/tool failed/);
  assert.deepEqual(await readdir(outDir),[]);
}));
test('stale recovery point is rejected after real decryption',()=>fixture(async ctx=>{
  const {file}=await packBackup(ctx),outDir=join(ctx.root,'old');
  await assert.rejects(unpackBackup({...ctx,encrypted:file,outDir,now:now.getTime()+86400001}),/freshness/);
  assert.deepEqual(await readdir(outDir),[]);
}));
test('wrong project, incomplete scope and extra payload all fail closed',()=>fixture(async ctx=>{
  await assert.rejects(packBackup({...ctx,projectRef:'fkefarcwadvyqqjcjxvp'}),/project/);
  await writeFile(join(ctx.sourceDir,'inventory.json'),'{}');
  await assert.rejects(packBackup(ctx),/schemas/);
  await writeFile(join(ctx.sourceDir,'private.key'),'do not release');
  await assert.rejects(packBackup(ctx),/payload/);
}));
test('missing encryption key never falls back to plaintext',async()=>{
  await assert.rejects(packBackup({recipient:''}),/recipient/);
});

test('actual decrypt CLI rejects malformed private manifest without echoing its contents',()=>fixture(async ctx=>{
  await packBackup(ctx);
  const marker='PRIVATE-MANIFEST-email@example.test';
  await writeFile(join(ctx.sourceDir,'manifest.json'),marker);
  const archive=join(ctx.root,'malformed.tar'),encrypted=join(ctx.root,'malformed.age');
  assert.equal(spawnSync('tar',['-cf',archive,'-C',ctx.sourceDir,
    'full.dump','public.dump','roles.sql','inventory.json','manifest.json'],{windowsHide:true}).status,0);
  assert.equal(spawnSync(ctx.age,['-r',ctx.recipient,'-o',encrypted,archive],{windowsHide:true}).status,0);
  const outDir=join(ctx.root,'cli-restore');
  const result=spawnSync(process.execPath,['tools/encrypted-backup.mjs','unpack'],{windowsHide:true,encoding:'utf8',
    env:{...process.env,AGE_BIN:ctx.age,BACKUP_ENCRYPTED_FILE:encrypted,BACKUP_IDENTITY_FILE:ctx.identity,BACKUP_RESTORE_DIR:outDir}});
  assert.equal(result.status,1);assert.equal(result.stdout,'');
  assert.doesNotMatch(result.stderr,/PRIVATE-|example\.test/);
  assert.equal(result.stderr.trim(),'Encrypted backup validation failed; private diagnostics withheld');
  assert.deepEqual(await readdir(outDir),[],'no decrypted payload retained after rejection');
}));
