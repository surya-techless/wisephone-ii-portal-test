import { connect, Connection } from "@tursodatabase/serverless";


export class WPIIPortalPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WPIIPortalPersistenceError";
  }
}


// from tursodatabase/serverless, reccommended by Turso
// this package also seems to have a more robust interface than Astro's
export class TursoDb {
  constructor(private readonly connection: Connection) { }

  public async batch(sqlStatements: string[]) {
    try {
      await this.connection.batch(sqlStatements);
    } catch (error) {
      console.error("❌ error:", error);
      throw new WPIIPortalPersistenceError("there was an error committing database transaction");
    }
  }

  public async execute(statement: string) {
    try {
      await this.connection.run(statement);
    } catch (error) {
      console.error("❌ error:", error);
      throw new WPIIPortalPersistenceError("there was an error executing SQL statement");
    }
  }
}

const tursoClientUrl: string = process.env.ASTRO_DB_REMOTE_URL || "";
const tursoClientauthToken: string = process.env.ASTRO_DB_APP_TOKEN || "";
const connection = connect({ url: tursoClientUrl, authToken: tursoClientauthToken });

export const tursoDb = new TursoDb(connection);
