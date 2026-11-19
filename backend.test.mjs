import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../worker/index.js';

test('persistent workspace, permissions, validation, audit and concurrent edits', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0000_workspace.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(query) {
      const stmt = sql.prepare(query);
      const operation = (args) => ({
        first: async () => stmt.get(...args) ?? null,
        execute: () => ({ results: stmt.all(...args) })
      });
      return { ...operation([]), bind: (...args) => operation(args) };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const out = statements.map(statement => statement.execute()); sql.exec('COMMIT'); return out; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    }
  };
  const env = { DB, GODOL_OWNER_EMAIL: 'owner@example.com' };
  const call = async (who, path = 'workspace', method = 'GET', body, origin = 'https://godol.test') => {
    const headers = { Origin: origin, 'Content-Type': 'application/json' };
    if (who) { headers['oai-authenticated-user-id'] = 'id-' + who; headers['oai-authenticated-user-email'] = who + '@example.com'; }
    const res = await worker.fetch(new Request('https://godol.test/api/' + path, { headers, method, body: body ? JSON.stringify(body) : undefined }), env);
    return { status: res.status, data: await res.json() };
  };
  assert.equal((await call(null)).status, 401);
  assert.equal((await call('unknown')).status, 403);
  const [first, second] = await Promise.all([call('owner'), call('owner')]);
  assert.equal(first.data.revision, 1);
  assert.deepEqual(second.data, first.data);
  assert.equal(first.data.user.role, 'admin');
  const demo = first.data.records;
  assert.deepEqual(Object.values(demo).map(rows => rows.length), [0, 0, 0, 0, 60, 132, 16, 59, 12, 24, 6, 8]);
  assert.equal(new Set(demo.employees.map(row => row.v[2])).size, 10);
  assert.equal(new Set(demo.employees.map(row => row.v[0].split(' ')[1])).size, 60);
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision: 1, changes: demo })).status, 200);
  const revision = 2;
  for (const role of ['staff', 'hr']) assert.equal((await call('owner', 'access', 'PUT', { role, email: role + '@example.com' })).status, 200);
  const employee = { id: 'e1', v: ['Test Employee', 'Engineer', 'Engineering', 'test@example.com', 'Active'] };
  const draft = { id: 'a1', v: ['Draft', 'Internal draft', '2026-11-06', 'Draft'] };
  const announcement = { id: 'a2', v: ['Update', 'Ready for staff', '2026-11-06', 'Published'] };
  const payroll = { id: 'p1', v: ['Test Employee', '2026-11', '1250.25', 'Processed'] };
  const changes = { employees: [employee], announcements: [draft, announcement], payroll: [payroll] };
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision, changes }, 'https://elsewhere.test')).status, 403);
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision, changes })).status, 200);
  assert.deepEqual((await call('owner')).data.records.employees, [employee]);
  const staff = await call('staff');
  assert.deepEqual(staff.data.records, {});
  assert.equal((await call('staff', 'workspace', 'PATCH', { revision: revision + 1, changes: { announcements: [] } })).status, 403);
  assert.equal((await call('hr', 'access')).status, 403);
  assert.equal((await call('hr')).data.records.payroll, undefined);
  assert.equal((await call('hr', 'workspace', 'PATCH', { revision: revision + 1, changes: { payroll: [] } })).status, 403);
  assert.equal((await call('hr', 'workspace', 'PATCH', { revision: revision + 1, changes: { employees: [employee, { ...employee, id: 'e2' }] } })).status, 400);
  const duplicateName = { id: 'e2', v: ['test employee', 'Analyst', 'Finance', 'other@example.com', 'Active'] };
  const duplicateResult = await call('hr', 'workspace', 'PATCH', { revision: revision + 1, changes: { employees: [employee, duplicateName] } });
  assert.equal(duplicateResult.status, 400);
  assert.match(duplicateResult.data.error, /full names/);
  const edits = await Promise.all([call('hr', 'workspace', 'PATCH', { revision: revision + 1, changes: { employees: [] } }), call('owner', 'workspace', 'PATCH', { revision: revision + 1, changes: { announcements: [] } })]);
  assert.deepEqual(edits.map(x => x.status).sort(), [200, 409]);
  assert.equal((await call('owner')).data.records.payroll.length, 1);
  assert.equal((await call('owner', 'access', 'DELETE', { email: 'staff@example.com' })).status, 200);
  assert.equal((await call('staff')).status, 403);
  const admin = await call('owner', 'access');
  assert.equal(admin.data.audit.length, 7);
  const current = await call('owner');
  const currentRevision = current.data.revision;
  const reviewer = { id: 'r1', v: ['Test Employee', 'Annual', 'Test Employee', 'Completed'] };
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision: currentRevision, changes: { employees: [employee], performance: [reviewer] } })).status, 200);
  const renamed = { ...employee, v: ['Renamed Employee', ...employee.v.slice(1)] };
  const saved = await call('hr', 'workspace', 'PATCH', { revision: currentRevision + 1, changes: { employees: [renamed] } });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.changes.employees, [renamed]);
  assert.deepEqual(saved.data.changes.performance[0].v, ['Renamed Employee', 'Annual', 'Renamed Employee', 'Completed']);
  assert.equal(saved.data.changes.payroll, undefined);
  assert.equal((await call('owner')).data.records.payroll[0].v[0], 'Renamed Employee');
  assert.deepEqual(admin.data.members, [{ email: 'hr@example.com', role: 'hr' }]);
  const legacy = {
    employees: [
      { id: 'employees0', v: ['Ayaan Warsame', 'Production Supervisor', 'Manufacturing', 'demo.001@godol.example', 'On leave'] },
      { id: 'employees1', v: ['Omar Custom', 'Engineer', 'Engineering', 'demo.002@godol.example', 'Active'] }
    ],
    attendance: [{ id: 'att1', v: ['Ayaan Warsame', '2026-11-06', '08:00', 'Present'] }],
    payroll: [{ id: 'pay1', v: ['Ayaan Warsame', '2026-11', '1000.00', 'Draft'] }],
    performance: [{ id: 'perf1', v: ['Omar Custom', 'Annual', 'Ayaan Warsame', 'Completed'] }]
  };
  sql.prepare('UPDATE workspace SET records = ? WHERE id = 1').run(JSON.stringify(legacy));
  const repaired = (await call('owner')).data;
  assert.equal(repaired.records.employees[0].v[0], 'Ayaan Cabdiraxmaan');
  assert.equal(repaired.records.employees[1].v[0], 'Omar Custom');
  assert.equal(repaired.records.attendance[0].v[0], 'Ayaan Cabdiraxmaan');
  assert.equal(repaired.records.payroll[0].v[0], 'Ayaan Cabdiraxmaan');
  assert.equal(repaired.records.performance[0].v[2], 'Ayaan Cabdiraxmaan');
  assert.deepEqual((await call('owner')).data, repaired);
  const employeeId = 'employees0';
  const contacts = [{ id: employeeId, v: ['+252 61 000 0000'] }];
  const bank = [{ id: employeeId, v: ['0001234567', 'salaam-somali-bank'] }];
  const saveDetails = await call('owner', 'workspace', 'PATCH', { revision: repaired.revision, changes: { contacts, bank } });
  assert.equal(saveDetails.status, 200);
  const asAdmin = await call('owner');
  assert.deepEqual(asAdmin.data.records.bank, bank);
  const asHr = await call('hr');
  assert.deepEqual(asHr.data.records.contacts, contacts);
  assert.equal(asHr.data.records.bank, undefined);
  assert.equal((await call('hr', 'workspace', 'PATCH', { revision: asHr.data.revision, changes: { bank: [] } })).status, 403);
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision: asAdmin.data.revision, changes: { bank: [{ id: employeeId, v: ['bad'] }] } })).status, 400);
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision: asAdmin.data.revision, changes: { contacts: [{ id: 'missing', v: ['1234567'] }] } })).status, 400);
  assert.equal((await call('hr', 'workspace', 'PATCH', { revision: asHr.data.revision, changes: { employees: repaired.records.employees.filter(row => row.id !== employeeId) } })).status, 200);
  assert.deepEqual((await call('owner')).data.records.bank, []);

  await call('owner', 'access', 'PUT', { email: 'staff@example.com', role: 'staff' });
  await call('owner', 'access', 'PUT', { email: 'another@example.com', role: 'staff' });
  assert.equal((await call('staff', 'my-profile')).status, 404);
  const portalRevision = (await call('owner')).data.revision;
  assert.equal((await call('hr', 'workspace', 'PATCH', { revision: portalRevision, changes: { staffLinks: [] } })).status, 403);
  const staffLinks = [{ id: 'employees1', v: ['staff@example.com'] }];
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision: portalRevision, changes: { staffLinks } })).status, 200);
  assert.equal((await call('another', 'my-profile')).status, 404);
  assert.equal((await call('staff', 'my-profile')).data.name, 'Omar Custom');
  assert.equal((await call('staff', 'my-profile')).data.bank, undefined);
  const input = { type: 'Annual', start: '2026-12-01', end: '2026-12-02' };
  assert.equal((await call('staff', 'my-profile', 'POST', input)).status, 201);
  assert.equal((await call('staff', 'my-profile', 'POST', input)).status, 409);
  const forHr = (await call('hr')).data;
  const request = forHr.records.leave.at(-1);
  const reviewed = { ...request, v: [...request.v.slice(0, 4), 'Approved'] };
  assert.equal((await call('hr', 'workspace', 'PATCH', { revision: forHr.revision, changes: { leave: [reviewed] } })).status, 200);
  assert.deepEqual((await call('staff', 'my-profile')).data.leave, [['Annual', '2026-12-01', '2026-12-02', 'Approved']]);

  const year = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Africa/Mogadishu' }).format(new Date());
  const beforeBalance = (await call('owner')).data;
  const leaveAllowances = [{ id: 'employees1', v: [year, '20'] }];
  assert.equal((await call('hr', 'workspace', 'PATCH', { revision: beforeBalance.revision, changes: { leaveAllowances } })).status, 403);
  const annual = { id: 'balance-test', v: ['Omar Custom', 'Annual', year + '-12-31', String(Number(year) + 1) + '-01-02', 'Pending'] };
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision: beforeBalance.revision, changes: { leaveAllowances } })).status, 200);
  assert.equal((await call('staff', 'my-profile', 'POST', { type: 'Annual', start: annual.v[2], end: annual.v[3] })).status, 201);
  const pendingBalance = (await call('staff', 'my-profile')).data.leaveBalance;
  const review = (await call('owner')).data;
  const approved = review.records.leave.map(row => row.v[2] === annual.v[2] ? { ...row, v: [...row.v.slice(0, 4), 'Approved'] } : row);
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision: review.revision, changes: { leave: approved } })).status, 200);
  const balance = (await call('staff', 'my-profile')).data.leaveBalance;
  assert.equal(balance.allowance, 20);
  assert.equal(balance.used, pendingBalance.used + 1);
  assert.equal(balance.remaining, 20 - balance.used);
  const withPortal = (await call('owner')).data;
  const publicDoc = { id: 'doc1', v: ['Shared', 'Policy', 'https://example.com/staff', 'Published'], internal: 'private' };
  const privateDoc = { id: 'doc2', v: ['Draft', 'Policy', '', 'Draft'] };
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision: withPortal.revision, changes: { documents: [publicDoc, privateDoc] } })).status, 200);
  const limited = (await call('staff')).data.records;
  assert.deepEqual(Object.keys(limited), ['announcements', 'documents']);
  assert.deepEqual(limited.documents, [{ id: publicDoc.id, v: publicDoc.v }]);
  assert.deepEqual((await call('another')).data.records, {});
  assert.equal((await call('staff', 'access')).status, 403);
  assert.equal((await call('staff', 'my-profile?employeeId=employees0')).data.name, 'Omar Custom');
  const beforeDeactivate = (await call('owner')).data;
  const inactive = beforeDeactivate.records.employees.map(row => row.id === 'employees1' ? { ...row, v: [...row.v.slice(0, 4), 'Inactive'] } : row);
  assert.equal((await call('owner', 'workspace', 'PATCH', { revision: beforeDeactivate.revision, changes: { employees: inactive } })).status, 200);
  assert.equal((await call('staff', 'my-profile')).status, 403);
  assert.deepEqual((await call('staff')).data.records, {});

});
