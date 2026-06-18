import mysql from "mysql2/promise";


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

  private async query<T = any>(sql: string, values?: any[]): Promise<T> {
    try {
      const [rows] = await this.connection.query({ sql, values, timeout: defaultTimeout });
      return rows as T;
    } catch (error) {
      console.error("❌ query error:", error);
      throw error;
    }
  }

  public async execute(statement: string, values: any[] = []) {
    try {
      return await this.query(statement, values);
    } catch (error) {
      throw new WPIIPortalPersistenceError("there was an error executing SQL statement");
    }
  }

  public async batch(statement: string, values: any[][]) {
    try {
      return await this.query(statement, values);
    } catch (error) {
      throw new WPIIPortalPersistenceError(
        "there was an error executing batch statement"
      );
    }
  }

  public async commitWithinTransaction(statements: string[]) {
    try {
      await this.connection.beginTransaction();
      console.log("✅ NOODLES transaction started");

      for (const statement of statements) {
        console.log("➡️ executing:", statement);
        await this.connection.query({ sql: statement, timeout: defaultTimeout });
      }

      await this.connection.commit();
      console.log("✅ NOODLES committed");
    } catch (error) {
      console.error("❌ NOODLES transaction failed:", error);

      try {
        await this.connection.rollback();
        console.log("↩️ NOODLES rollback complete");
      } catch (rollbackError) {
        console.error("❌ rollback failed:", rollbackError);
      }

      throw new WPIIPortalPersistenceError(
        "there was an error executing database transaction"
      );
    }
  }
}

async function getMySQLClient(): Promise<MySQLDb> {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: defaultDb,
    connectTimeout: 10000,
  });

  console.log("✅ MySQL connected");

  return new MySQLDb(connection);
}

export const mySQLClient = await getMySQLClient();
