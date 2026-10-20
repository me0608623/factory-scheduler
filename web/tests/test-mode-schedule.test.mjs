import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nearestScheduleDate, scheduledMachinesFirst } from '../src/test-mode.js';
import { tx, I18N } from '../src/i18n.js';

test('finds the closest date containing schedule blocks on visible machines', () => {
  const blocks = [
    {m:'M1',date:'2026-10-10'},
    {m:'M1',date:'2026-10-15'},
    {m:'M2',date:'2026-10-21'},
    {m:'M3',date:'not-a-date'},
  ];
  assert.equal(nearestScheduleDate(blocks,['M1'],'2026-10-20'),'2026-10-15');
  assert.equal(nearestScheduleDate(blocks,['M2'],'2026-10-20'),'2026-10-21');
  assert.equal(nearestScheduleDate(blocks,['missing'],'2026-10-20'),null);
});

test('test day puts machines with scheduled work first without disturbing stable order', () => {
  const machines=[{id:'M1'},{id:'M2'},{id:'M3'},{id:'M4'}];
  const blocks=[
    {m:'M3',date:'2026-10-20'},
    {m:'M2',date:'2026-10-20'},
    {m:'M1',date:'2026-10-21'},
  ];
  assert.deepEqual(scheduledMachinesFirst(machines,blocks,'2026-10-20').map(m=>m.id),['M2','M3','M1','M4']);
  assert.deepEqual(scheduledMachinesFirst(machines,blocks,'2026-10-22').map(m=>m.id),['M1','M2','M3','M4']);
  assert.deepEqual(machines.map(m=>m.id),['M1','M2','M3','M4'],'input order is not mutated');
});

test('test mode is explicit at the upper-left and empty dates link to real test data', () => {
  const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/testModeLabelHTML=.*此為測試模式/);
  assert.match(app,/testDataDate\?' test-data-empty'/);
  assert.match(app,/data-act="goto" data-d="'\+testDataDate\+'"/);
  assert.match(app,/nearestScheduleDate\(S\.blocks,ms\.map\(m=>m\.id\),d\)/);
  assert.match(app,/scheduledMachinesFirst\(baseMachines,S\.blocks,d\)/);
});

test('new test-mode guidance is translated', () => {
  I18N.lang='en';
  assert.equal(tx('此為測試模式'),'Test mode');
  assert.equal(tx('前往測試資料'),'Go to test schedule');
  assert.equal(tx('現有測試資料在 {date}',{date:'10/15 (Thu)'}),'Test schedule data is available on 10/15 (Thu)');
  I18N.lang='zh-TW';
});
