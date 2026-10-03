// Runs the Supabase migrations against PGlite (Postgres in WASM) with a
// minimal stand-in for Supabase's auth schema, then checks the security
// and timer rules. Usage: npm run test:sql
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const db = new PGlite()

process.on('unhandledRejection', (error) => {
  console.error(`SQL check failed: ${error.message}`)
  process.exit(1)
})

await db.exec(`
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role authenticated nologin;
  create publication supabase_realtime;
`)

const dir = 'supabase/migrations'
for (const file of readdirSync(dir).sort()) {
  await db.exec(readFileSync(join(dir, file), 'utf8'))
  console.log(`applied ${file}`)
}

// Supabase grants table access to the authenticated role by default.
await db.exec(`
  grant usage on schema public to authenticated;
  grant usage on schema auth to authenticated;
  grant all on all tables in schema public to authenticated;
`)

const alice = '00000000-0000-0000-0000-00000000000a'
const bob = '00000000-0000-0000-0000-00000000000b'
await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"full_name":"Alice"}'), ($2, '{}')`, [alice, bob])

async function as(user, fn) {
  await db.exec('begin')
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user])
  await db.exec('set local role authenticated')
  try {
    const result = await fn()
    await db.exec('commit')
    return result
  } catch (error) {
    await db.exec('rollback')
    throw error
  }
}

// Profiles are created by the auth trigger.
const profiles = await db.query('select id, display_name from public.profiles order by id')
assert.equal(profiles.rows.length, 2)
assert.equal(profiles.rows[0].display_name, 'Alice')

// Alice builds her data.
const { categoryId, projectId, tagId } = await as(alice, async () => {
  const c = await db.query(`insert into categories (name) values ('ACME') returning id`)
  const p = await db.query(`insert into projects (name, category_id, budget_days) values ('Audit', $1, 10) returning id`, [c.rows[0].id])
  const t = await db.query(`insert into tags (name) values ('réunion') returning id`)
  return { categoryId: c.rows[0].id, projectId: p.rows[0].id, tagId: t.rows[0].id }
})

// Timer: starting twice keeps a single running entry.
await as(alice, async () => {
  await db.query(`select * from start_timer($1, 'first', array[$2]::uuid[], now() - interval '1 hour')`, [projectId, tagId])
  await db.query(`select * from start_timer($1, 'second', '{}', now())`, [projectId])
  const running = await db.query('select description from time_entries where end_at is null')
  assert.deepEqual(running.rows.map((r) => r.description), ['second'])
  const total = await db.query('select count(*)::int as n from time_entries')
  assert.equal(total.rows[0].n, 2)
})

// A second running entry inserted directly is rejected.
await assert.rejects(
  as(alice, () => db.query(`insert into time_entries (start_at) values (now())`)),
  /time_entries_one_running_idx/,
)

// Bob sees nothing of Alice's data and cannot attach her project.
await as(bob, async () => {
  for (const table of ['categories', 'projects', 'tags', 'time_entries', 'profiles']) {
    const r = await db.query(`select count(*)::int as n from ${table} where ${table === 'profiles' ? 'id' : 'user_id'} <> auth.uid()`)
    assert.equal(r.rows[0].n, 0, `bob must not read ${table} of others`)
  }
  const updated = await db.query(`update projects set name = 'hacked' where id = $1`, [projectId])
  assert.equal(updated.affectedRows ?? 0, 0)
})
await assert.rejects(
  as(bob, () => db.query(`insert into time_entries (project_id, start_at, end_at) values ($1, now(), now())`, [projectId])),
  /row-level security/,
)
await assert.rejects(
  as(bob, () => db.query(`insert into projects (name, category_id) values ('x', $1)`, [categoryId])),
  /row-level security/,
)

// Deleting a tag removes it from entries; deleting a project keeps the time.
await as(alice, async () => {
  await db.query('delete from tags where id = $1', [tagId])
  const tagged = await db.query(`select count(*)::int as n from time_entries where cardinality(tag_ids) > 0`)
  assert.equal(tagged.rows[0].n, 0)
  await db.query('delete from projects where id = $1', [projectId])
  const orphans = await db.query('select count(*)::int as n from time_entries where project_id is null')
  assert.equal(orphans.rows[0].n, 2)
})

// End before start is rejected.
await assert.rejects(
  as(alice, () => db.query(`insert into time_entries (start_at, end_at) values (now(), now() - interval '1 minute')`)),
  /time_entries_end_after_start/,
)

console.log('SQL checks passed')
