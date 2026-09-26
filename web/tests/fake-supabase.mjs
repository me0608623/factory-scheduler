// 測試用：用 PGlite（WASM 版 PostgreSQL）＋ 真的 migrations 模擬 Supabase 用戶端
// 只實作 SupabaseStore 用到的部分：auth、from().select/upsert/delete、rpc、channel
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../db");

export async function makeDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  try { await db.exec("create publication supabase_realtime"); } catch {}
  for (const f of fs.readdirSync(path.join(DB_DIR, "migrations")).sort()) {
    await db.exec(fs.readFileSync(path.join(DB_DIR, "migrations", f), "utf8"));
  }
  await db.exec(fs.readFileSync(path.join(DB_DIR, "seed.sql"), "utf8"));
  return db;
}

const val = (v) => (v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v);
const clean = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));

export class FakeSupabase {
  constructor(db, users) {
    this.db = db;
    this.users = users;        // email → {id, password}
    this.uid = null;
    this.resetRequests = [];
    this.auth = {
      getSession: async () => ({ data: { session: this.uid ? this._session() : null } }),
      signInWithPassword: async ({ email, password }) => {
        const u = this.users[email];
        if (!u || u.password !== password) return { data: {}, error: { message: "Invalid login credentials" } };
        this.uid = u.id;
        return { data: { session: this._session() }, error: null };
      },
      resetPasswordForEmail: async (email, options) => {
        this.resetRequests.push({ email, ...options });
        return { error: null };
      },
      updateUser: async ({ password }) => {
        if (!this.uid) return { error: { message: "Not authenticated" } };
        const user = Object.values(this.users).find(u => u.id === this.uid);
        user.password = password;
        return { error: null };
      },
      signOut: async () => { this.uid = null; return { error: null }; },
    };
  }
  _session() { return { access_token: "jwt-" + this.uid, user: { id: this.uid, email: "x" } }; }

  async _run(sql, params = []) {
    await this.db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${this.uid || ""}', false);`);
    try {
      const r = await this.db.query(sql, params);
      return { data: r.rows.map(clean), error: null };
    } catch (e) {
      return { data: null, error: { message: e.message, code: e.code } };
    } finally {
      await this.db.exec("reset role;");
    }
  }

  async rpc(fn, args = {}) {
    const keys = Object.keys(args);
    const r = await this._run(`select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(", ")}) as r`, keys.map((k) => val(args[k])));
    return r.error ? r : { data: r.data[0].r, error: null };
  }

  from(table) {
    const self = this;
    const q = { op: "select", cols: "*", where: [], order: null, limit: null, single: false, insertRows: null };
    const b = {
      select(cols = "*") { q.cols = cols; return b; },
      eq(col, v) { q.where.push([col, v]); return b; },
      order(col, { ascending = true } = {}) { q.order = `${col} ${ascending ? "asc" : "desc"}`; return b; },
      limit(n) { q.limit = n; return b; },
      maybeSingle() { q.single = true; return b; },
      single() { q.single = true; return b; },
      insert(row) { q.op = "insert"; q.insertRows = Array.isArray(row) ? row : [row]; return b; },
      delete() { q.op = "delete"; return b; },
      async upsert(rows, { onConflict }) {
        for (const row of rows) {
          const cols = Object.keys(row);
          const set = cols.filter((c) => !onConflict.split(",").includes(c)).map((c) => `${c} = excluded.${c}`);
          const sql = `insert into ${table} (${cols.join(",")}) values (${cols.map((_, i) => "$" + (i + 1)).join(",")})
                       on conflict (${onConflict}) do ${set.length ? "update set " + set.join(", ") : "nothing"}`;
          const r = await self._run(sql, cols.map((c) => c === "overtime_weekdays" ? `{${row[c].join(",")}}` : val(row[c])));
          if (r.error) return r;
        }
        return { data: null, error: null };
      },
      then(resolve, reject) {
        const w = q.where.map(([c], i) => `${c} = $${i + 1}`).join(" and ");
        const row = q.insertRows?.[0], cols = row ? Object.keys(row) : [];
        const params = q.op === "insert" ? cols.map(c => val(row[c])) : q.where.map(([, v]) => v);
        const sql = q.op === "delete" ? `delete from ${table}${w ? " where " + w : ""}`
          : q.op === "insert" ? `insert into ${table} (${cols.join(",")}) values (${cols.map((_, i) => "$" + (i + 1)).join(",")}) returning ${q.cols}`
          : `select ${q.cols} from ${table}${w ? " where " + w : ""}${q.order ? " order by " + q.order : ""}${q.limit ? " limit " + q.limit : ""}`;
        return self._run(sql, params).then((r) => (q.single && !r.error ? { data: r.data[0] || null, error: null } : r)).then(resolve, reject);
      },
    };
    return b;
  }

  channel() {
    const ch = { on() { return ch; }, subscribe() { return ch; } };
    return ch;
  }
}
