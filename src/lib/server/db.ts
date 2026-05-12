import postgres from 'postgres';
import { env } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __lumaConsoleSql: postgres.Sql | undefined;
}

function createSqlClient() {
  return postgres(env('DATABASE_URL', 'postgres://postgres:postgres@127.0.0.1:5432/luma_console'), {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 20,
    prepare: false,
    transform: {
      undefined: null
    }
  });
}

function getSqlClient() {
  if (globalThis.__lumaConsoleSql) return globalThis.__lumaConsoleSql;

  const client = createSqlClient();
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__lumaConsoleSql = client;
  }
  return client;
}

export const sql = new Proxy((() => {}) as unknown as postgres.Sql, {
  apply(_target, _thisArg, args) {
    return Reflect.apply(getSqlClient() as never, getSqlClient(), args);
  },
  get(_target, prop) {
    const client = getSqlClient() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  }
});

export type Sql = typeof sql;

export function jsonb(value: unknown) {
  return sql.json(value as never);
}
