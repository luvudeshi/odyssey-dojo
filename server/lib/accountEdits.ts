// What a signed-in player may change about an account: the sign-in name and the password. The statements live here so
// ./accounts stays under its size; it hands over its own `run`, gate and known-sessions memory (createAccounts).
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { log } from "../../src/core/log";
import type { Gate, KnownSessions } from "./accountLimits";
import { nameKey } from "./accountRules";
import type { Reach } from "./accounts";

/** A name that was just taken from the account by another one, or an account that no longer exists, are not told apart from a missing row. */
export type Renamed = { readonly name: string } | "name_taken" | "gone";
export type PasswordChanged = "changed" | "wrong_password" | "gone";

export interface EditEnv {
  /**
   * One statement. `tolerate` is a Postgres error code that is answered with no rows instead of a failure, and that the
   * database being up counts for: it is not one of the failures that switch accounts off.
   */
  readonly run: (text: string, params: readonly unknown[], counted?: boolean, tolerate?: string) => Promise<unknown[]>;
  readonly table: { readonly accounts: string; readonly sessions: string };
  readonly gate: Gate;
  readonly known: KnownSessions;
  readonly hash: (password: string, salt: Buffer) => Promise<Buffer>;
  readonly verify: (password: string, salt: Buffer, expected: Buffer) => Promise<boolean>;
  readonly tokenHash: (token: string) => string;
  readonly saltBytes: number;
  /** Rows of the expected shape, or Unavailable. */
  readonly rowsOf: <T>(shape: z.ZodType<T>, rows: unknown[]) => T[];
}

const UNIQUE_VIOLATION = "23505";
const keyRow = z.object({ pass_hash: z.string().regex(/^[0-9a-f]+$/), salt: z.string().regex(/^[0-9a-f]+$/) });
const nameRow = z.object({ name: z.string().min(1).max(64) });

export interface Edits {
  /**
   * `name` is already cleaned (accountName). A name another account holds is "name_taken", whether it was seen before the
   * update or won by a second rename at the same moment. The same name in other letters or spacing is this account's own.
   */
  readonly rename: (accountId: string, name: string) => Promise<Renamed>;
  /**
   * Checks `current`, then replaces the hash and the salt and ends every other session of the account in one statement.
   * `keepToken` is the caller's own session and stays. `urgent` is this machine and `reach` runs the statements (see Accounts.signUp).
   */
  readonly changePassword: (
    accountId: string, current: string, next: string, keepToken: string, urgent?: boolean, reach?: Reach,
  ) => Promise<PasswordChanged>;
}

export function createEdits(env: EditEnv): Edits {
  const { run, table, gate, known } = env;
  const direct: Reach = (work) => work();
  return {
    rename: async (accountId, name) => {
      // Written so the normal case never meets the unique key: no row changes while another account has the key.
      const rows = await run(
        `update ${table.accounts} set name = $2::text, name_key = $3::text
        where id = $1::uuid and not exists (select 1 from ${table.accounts} other where other.name_key = $3::text and other.id <> $1::uuid)
        returning name`,
        [accountId, name, nameKey(name)], true, UNIQUE_VIOLATION,
      );
      const done = env.rowsOf(nameRow, rows)[0];
      if (done !== undefined) return { name: done.name };
      const still = await run(`select 1 as here from ${table.accounts} where id = $1::uuid`, [accountId]);
      return still.length > 0 ? "name_taken" : "gone";
    },

    changePassword: async (accountId, current, next, keepToken, urgent = false, reach = direct) => {
      const found = env.rowsOf(keyRow, await reach(() => run(
        `select encode(pass_hash, 'hex') as pass_hash, encode(salt, 'hex') as salt from ${table.accounts} where id = $1::uuid`,
        [accountId],
      )))[0];
      if (found === undefined) return "gone";
      if (!await gate(() => env.verify(current, Buffer.from(found.salt, "hex"), Buffer.from(found.pass_hash, "hex")), urgent)) return "wrong_password";
      const salt = randomBytes(env.saltBytes);
      const hash = await gate(() => env.hash(next, salt), urgent);
      const keep = env.tokenHash(keepToken);
      // One statement, so the new password and the ended sessions come together or not at all. It changes the row only while the
      // old hash is still there: a second change made since the check above is not overwritten by this one.
      const changed = await reach(() => run(
        `with changed as (
          update ${table.accounts} set pass_hash = decode($2::text, 'hex'), salt = decode($3::text, 'hex')
          where id = $1::uuid and pass_hash = decode($4::text, 'hex') returning id
        ), ended as (
          delete from ${table.sessions} where account_id = $1::uuid and token_hash <> decode($5::text, 'hex') and exists (select 1 from changed) returning 1
        )
        select id::text as id from changed`,
        [accountId, hash.toString("hex"), salt.toString("hex"), found.pass_hash, keep],
      ));
      if (changed.length === 0) return "wrong_password";
      // After the database: a session another request asked about just now cannot come back, it is gone there.
      known.forgetAccount(accountId, keep);
      log("info", "account_password_changed");
      return "changed";
    },
  };
}
