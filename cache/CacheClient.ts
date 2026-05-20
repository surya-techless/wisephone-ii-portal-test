import { createClient } from 'redis';


export class CacheClient {
  // assume that each device encounters 1 error event every 10 minutes:
  //  20000 error events every 10 minutes
  //  2000 error events / minute
  //  33.3 error events / second

  //  buffer threshold of 5000 = 1 bulk db insert every 2.5 minutes
  // 5000 buffer size is just to start us out
  public static readonly bufferSizeNumKeys: number = 5000;  // TODO: confirm appropriate log db insert interval
  private static readonly CACHE_PORT: number = 6379;
  private static readonly SOCKET_TIMEOUT_MS: number = 5000;
  private static readonly errorMessageDefault: string = "An cache exception occurred: ";

  private static async getClient() {
    const client = createClient({
      url: process.env.CACHE_CONNECTION_STRING,
      socket: {
        // tls: true,  TODO
        connectTimeout: this.SOCKET_TIMEOUT_MS,
      }
    })
      .on("sharded-channel-moved", () => console.log("Redis sharded-channel-moved"))
      .on("connect", () => console.log("Redis connect"))
      .on("ready", () => console.log("Redis ready"))
      .on("reconnecting", () => console.log("Redis reconnecting"))
      .on("end", () => console.log("Redis end"))
      .on("error", (e) => console.log(`Redis error: ${e}`))
      .connect();
    return client;
  }

  public static async getBufferSize(): Promise<number> {
    let client = null;

    try {
      client = await this.getClient();
      return await client.dbSize();  // total number of keys in cache
    } catch (e) {
        console.error(this.errorMessageDefault, e);
        return -1;
    } finally {
      if (client) {
        await client.quit();
      }
    }
  }

  // public static async getAll() {
  //   let client = null;

  //   try {
  //     client = await this.getClient();
  //     return await client.keys("*");
  //   } catch (e) {
  //     console.error(this.errorMessageDefault, e);
  //   } finally {
  //     if (client) {
  //       await client.quit();
  //     }
  //   }
  // }

  public static async flush() {
    let client = null;

    try {
      client = await this.getClient();
      await client.flushDb();
    } catch (e) {
      console.error(this.errorMessageDefault, e);
    } finally {
      if (client) {
        await client.quit();
      }
    }
  }

  public static async get(key: string) {
    let client = null;

    try {
      client = await this.getClient();
      return await client.get(key);
    } catch (e) {
      console.error(this.errorMessageDefault, e);
    } finally {
      if (client) {
        await client.quit();
      }
    }
  }

  public static async set(key: string, value: string) {
    let client = null;

    try {
      client = await this.getClient();
      await client.set(key, value);
    } catch (e) {
      console.error(this.errorMessageDefault, e);
    } finally {
      if (client) {
        client.close();
      }
    }
  }
}
