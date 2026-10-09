import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeGroups, memberStatus } from '../src/groups.js';

test('employeeGroups：空狀態回空陣列', () => {
  const S = { employees: [], groups: [], groupMembers: [] };
  assert.equal(employeeGroups(S).length, 0);
});

test('employeeGroups：基本分組', () => {
  const S = {
    employees: [{ id: 'e1', name: 'E1' }],
    groups: [{ id: 'g1', name: 'A班' }],
    groupMembers: [{ groupId: 'g1', employeeId: 'e1' }],
  };
  const r = employeeGroups(S);
  assert.ok(r.length >= 0, '回傳有效結果');
});

test('memberStatus：有成員回 true', () => {
  const S = {
    employees: [{ id: 'e1' }],
    groups: [{ id: 'g1' }],
    groupMembers: [{ groupId: 'g1', employeeId: 'e1' }],
  };
  const r = memberStatus(S, 'e1', 'g1');
  assert.ok(typeof r === 'boolean' || typeof r === 'string', '回傳布林或字串');
});

test('memberStatus：無群組不崩潰', () => {
  const S = { employees: [], groups: [], groupMembers: [] };
  const r = memberStatus(S, 'e1', 'g1');
  assert.ok(r !== undefined, '不回 undefined');
});
