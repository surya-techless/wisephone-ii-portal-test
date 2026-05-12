import { connect, Connection } from "@tursodatabase/serverless";


export class WPIIPortalPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WPIIPortalPersistenceError";
  }
}


// from tursodatabase/serverless, reccommended by Turso
// this package also seems to have a more robust interface than Astro's
export class TursoClient {
  public static connection(): Connection {
    const tursoClientUrl: string = process.env.ASTRO_DB_REMOTE_URL || "";
    const tursoClientauthToken: string = process.env.ASTRO_DB_APP_TOKEN || "";

    if (tursoClientUrl === "" || tursoClientauthToken === "") {
      throw new WPIIPortalPersistenceError("error getting Turso client credentials");
    }

    return connect({ url: tursoClientUrl, authToken: tursoClientauthToken});
  }
}
