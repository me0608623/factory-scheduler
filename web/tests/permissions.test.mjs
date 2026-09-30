import test from 'node:test';
import assert from 'node:assert/strict';
import {effectivePermission,roleDefaultPermission} from '../src/permissions.js';

test('職位只提供預設值，老闆可逐項覆蓋其他職位',()=>{
  assert.equal(roleDefaultPermission('lead','schedule.manage'),true);
  assert.equal(roleDefaultPermission('lead','master.manage'),false);
  assert.equal(roleDefaultPermission('viewer','orders.manage'),false);
  assert.equal(effectivePermission('viewer',{'orders.manage':true},'orders.manage'),true);
  assert.equal(effectivePermission('lead',{'incidents.manage':false},'incidents.manage'),false);
});

test('老闆永遠保留全部功能，避免關閉自己的管理入口',()=>{
  assert.equal(effectivePermission('boss',{'schedule.manage':false},'schedule.manage'),true);
  assert.equal(effectivePermission('boss',{},'master.manage'),true);
});
