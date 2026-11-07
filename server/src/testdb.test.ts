// 测试库安全闸门的反向测试（PR #27 审核 P1-01）：远程地址、错误端口、错误库名、带参数的连接串都要在清库前被拒绝。
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPool } from './db.ts';
import { checkConnectedTestDb, checkTestUrl, TEST_DB } from './testdb.ts';

const P = TEST_DB.port;

describe('测试库安全闸门：连接串', () => {
  test('本项目本机测试库放行（127.0.0.1 或 localhost）', () => {
    assert.equal(checkTestUrl(`postgres://u:p@127.0.0.1:${P}/trainee_hub_test`), null);
    assert.equal(checkTestUrl(`postgresql://u:p@localhost:${P}/trainee_hub_test`), null);
  });

  test('没设置、格式不对、不是 PostgreSQL：拒绝', () => {
    assert.match(String(checkTestUrl(undefined)), /没有设置/);
    assert.match(String(checkTestUrl('不是连接串')), /格式不对/);
    assert.match(String(checkTestUrl(`mysql://u:p@127.0.0.1:${P}/trainee_hub_test`)), /不是 PostgreSQL/);
  });

  test('远程地址上的 _test 库：拒绝', () => {
    assert.match(String(checkTestUrl(`postgres://u:p@db.example.com:${P}/trainee_hub_test`)), /只能在本机/);
    assert.match(String(checkTestUrl(`postgres://u:p@10.0.0.5:${P}/trainee_hub_test`)), /只能在本机/);
  });

  test('错误端口：拒绝（含不写端口时的默认 5432）', () => {
    assert.match(String(checkTestUrl('postgres://u:p@127.0.0.1:5432/trainee_hub_test')), /端口/);
    assert.match(String(checkTestUrl('postgres://u:p@127.0.0.1/trainee_hub_test')), /端口/);
  });

  test('错误库名：拒绝（开发库、别的 _test 库都不行）', () => {
    assert.match(String(checkTestUrl(`postgres://u:p@127.0.0.1:${P}/trainee_hub`)), /库名/);
    assert.match(String(checkTestUrl(`postgres://u:p@127.0.0.1:${P}/other_test`)), /库名/);
  });

  test('带参数（可改掉实际地址）：拒绝', () => {
    assert.match(String(checkTestUrl(`postgres://u:p@127.0.0.1:${P}/trainee_hub_test?host=db.example.com`)), /不能带参数/);
  });
});

describe('测试库安全闸门：连上之后再核对', () => {
  test('连到测试库：通过', async () => {
    const pool = createPool(process.env.TEST_DATABASE_URL);
    try {
      assert.equal(await checkConnectedTestDb(pool), null);
    } finally {
      await pool.end();
    }
  });

  test('连到开发库：拒绝（只读查询，不动开发库）', async () => {
    const pool = createPool(process.env.DATABASE_URL);
    try {
      assert.match(String(await checkConnectedTestDb(pool)), /不是本项目测试库/);
    } finally {
      await pool.end();
    }
  });
});
