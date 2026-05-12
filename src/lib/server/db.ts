import postgres from 'postgres';
import { requireEnv } from './env';

declare global {
  // eslint-disable-next-line no-var
  var __lumaConsoleSql: postgres.Sql | undefined;
}

export const sql =
  globalThis.__lumaConsoleSql ??
  postgres(requireEnv('DATABASE_URL'), {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 20,
    prepare: false,
    transform: {
      undefined: null
    }
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__lumaConsoleSql = sql;
}

export type Sql = typeof sql;
