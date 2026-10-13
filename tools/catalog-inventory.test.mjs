import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {PGlite} from '../web/node_modules/@electric-sql/pglite/dist/index.js';
import {inventorySQL,renderInventory} from './catalog-inventory.mjs';

const privateText='PRIVATE-EMPLOYEE-email@example.test';
async function fixture(fn){
  const db=new PGlite();
  try{
    await db.exec(`
      CREATE TABLE employees(id text,name text,factory int,active bool,review_status text);
      CREATE TABLE employee_skills(employee_id text,machine_id text);
      CREATE TABLE machines(id text,label text,process text,factory int,active bool,review_status text);
      CREATE TABLE machine_products(machine_id text,product_id text);
      CREATE TABLE products(id text,code text,name text,active bool);
      CREATE TABLE product_steps(product_id text,seq int,process text,factory int,rate numeric,transfer_batch int);
      CREATE TABLE work_windows(id text,start_min int,end_min int);
      CREATE TABLE calendar_weekly(weekday int,is_open bool);
      CREATE TABLE calendar_days(date date,is_open bool);
      CREATE TABLE holidays(date date,name text);
      CREATE TABLE employee_overtime_days(date date,employee_id text);
      CREATE TABLE machine_faults(date date,fixed_at timestamptz);
      CREATE TABLE orders(id text);
      INSERT INTO employees VALUES ('secret-e','${privateText}',1,true,'pending'),('secret-e2','${privateText}',2,true,'confirmed');
      INSERT INTO machines VALUES ('secret-m','PRIVATE-MACHINE','PRIVATE-PROCESS',1,true,'pending');
      INSERT INTO employee_skills VALUES ('secret-e2','secret-m');
      INSERT INTO products VALUES ('secret-p','PRIVATE-PRODUCT','PRIVATE-PRODUCT-NAME',true);
      INSERT INTO product_steps VALUES ('secret-p',0,'PRIVATE-PROCESS',1,100,0),('secret-p',1,'OTHER-PROCESS',2,1,60);
      INSERT INTO holidays VALUES(current_date,'PRIVATE-HOLIDAY');
      INSERT INTO orders VALUES ('PRIVATE-ORDER');
    `);
    await fn(db);
  }finally{await db.close();}
}

test('legacy inventory query exposes real catalog strings; replacement executes SQL but publishes only counts',()=>fixture(async db=>{
  const old=await db.query("SELECT string_agg(id||' '||label,'、') AS result FROM machines");
  assert.match(old.rows[0].result,/PRIVATE-MACHINE/,'reproduce the old public-report leak with synthetic data');
  const results=await db.exec(inventorySQL);
  const counts=results.find(r=>r.rows?.length)?.rows[0].jsonb_build_object;
  assert.equal(counts.employees,2);assert.equal(counts.employees_duplicate,1);
  assert.equal(counts.employees_pending,1);assert.equal(counts.skills_cross_factory,1);
  assert.equal(counts.steps_no_machine,1);assert.equal(counts.steps_no_mold,2);
  assert.equal(counts.steps_no_staff,2);assert.equal(counts.rates_suspicious,1);
  const report=renderInventory(counts,{artifactId:'123'});
  assert.match(report,/名冊總數：2/);assert.doesNotMatch(report,/PRIVATE-|secret-|example\.test/);
  assert.equal((await db.query('SELECT count(*)::int n FROM employees')).rows[0].n,2);
  assert.equal((await db.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'off','read-only transaction ends without mutation');
}));

test('empty catalog remains valid zero counts, not an invented demo',()=>fixture(async db=>{
  await db.exec('TRUNCATE employees,employee_skills,machines,machine_products,products,product_steps,orders,holidays');
  const result=(await db.exec(inventorySQL)).find(r=>r.rows?.length).rows[0].jsonb_build_object;
  assert.equal(result.employees,0);assert.equal(result.steps_no_staff,0);
  assert.match(renderInventory(result,{artifactId:1}),/名冊總數：0/);
}));

test('report boundary rejects private strings, missing metrics, extra fields, unsafe integers and injected provenance',()=>fixture(async db=>{
  const valid=(await db.exec(inventorySQL)).find(r=>r.rows?.length).rows[0].jsonb_build_object;
  for(const bad of [null,[],{...valid,employees:privateText},{...valid,employees:-1},
    {...valid,employees:NaN},{...valid,employees:Infinity},{...valid,employees:2**54},
    {...valid,privateField:privateText},Object.fromEntries(Object.entries(valid).slice(1))]){
    assert.throws(()=>renderInventory(bad,{artifactId:1}),e=>!e.message.includes(privateText)&&/rejected/.test(e.message));
  }
  assert.throws(()=>renderInventory(valid,{artifactId:'123\n'+privateText}),/rejected/);
}));

test('actual CLI parse failures never print JSON source excerpts or paths',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'catalog-private-fixture-'));
  try{
    const file=join(dir,'private.json');await writeFile(file,'{'+privateText);
    const result=spawnSync(process.execPath,['tools/catalog-inventory.mjs','report',file],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,1);assert.equal(result.stdout,'');
    assert.equal(result.stderr.trim(),'Inventory failed; private diagnostics withheld');
  }finally{await rm(dir,{recursive:true,force:true});}
});
