import mysql from "mysql2/promise";


export type SQL = {
  statement: string,
  values: any[]
}



export class WPIIPortalPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WPIIPortalPersistenceError";
  }
}


const defaultDb = "wiseos";
const defaultTimeout = 10000;  // milliseconds (10 seconds)


export class MySQLDb {
  constructor(private readonly connection: mysql.Connection) {}

  private async query<T = any>(sql: SQL): Promise<T> {
    try {
      const [rows] = await this.connection.query({
        sql: sql.statement,
        values: sql.values,
        timeout: defaultTimeout
      });
      return rows as T;
    } catch (error) {
      throw new WPIIPortalPersistenceError(`❌ [MySQLDb] query error: ${error}`);
    }
  }

  public async commitWithinTransaction(sqls: SQL[]) {
    try {
      await this.connection.beginTransaction();

      for (const sql of sqls) {
        console.log("➡️ executing:", sql.statement);
        await this.query(sql);
      }

      await this.connection.commit();
    } catch (error) {
      try {
        console.error("❌ [MySQLDb] there was an error executing database transaction...attempting rollback");
        await this.connection.rollback();
        console.log("↩️ [MySQLDb] rollback complete");
      } catch (rollbackError) {
        console.error("❌ [MySQLDb] rollback failed:", rollbackError);
      }
      throw new WPIIPortalPersistenceError("❌ [MySQLDb] there was an error executing database transaction");
    }
  }
}

async function getMySQLClient(): Promise<MySQLDb> {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: defaultDb,
    connectTimeout: defaultTimeout,
  });

  console.log("✅ [MySQLDb] connected");

  return new MySQLDb(connection);
}

export const mySQLClient = await getMySQLClient();
