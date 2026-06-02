import { createClient, type RedisClientType } from "redis";

export class Cache {
  // assume that each device encounters 1 error event every 10 minutes:
  // 20000 error events every 10 minutes
  // 2000 error events / minute
  // 33.3 error events / second

  // buffer threshold of 5000 = 1 bulk db insert every 2.5 minutes
  public static readonly bufferSizeNumKeys = 2; // NOODLES
  private static readonly LOG_LIST_KEY = "logs";
  private static readonly errorMessageDefault = "A cache exception occurred:";

  constructor(private readonly client: any) { }

  public async getBufferSize(): Promise<number> {
    try {
      return await this.client.lLen(Cache.LOG_LIST_KEY);
    } catch (e) {
      console.error(Cache.errorMessageDefault, e);
      return -1;
    }
  }

  public async getAll(): Promise<string[]> {
    try {
      return await this.client.lRange(Cache.LOG_LIST_KEY, 0, -1);
    } catch (e) {
      console.error(Cache.errorMessageDefault, e);
      return [];
    }
  }

  public async flush(batchSize: number = Cache.bufferSizeNumKeys): Promise<void> {
    try {
      await this.client.lTrim(Cache.LOG_LIST_KEY, batchSize, -1);
    } catch (e) {
      console.error(Cache.errorMessageDefault, e);
    }
  }

  public async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (e) {
      console.error(Cache.errorMessageDefault, e);
      return null;
    }
  }

  public async push(value: string): Promise<void> {
    try {
      await this.client.rPush(Cache.LOG_LIST_KEY, value);
    } catch (e) {
      console.error(Cache.errorMessageDefault, e);
    }
  }
}

// ---------- singleton wiring ----------

const redisClient = createClient({
  url: process.env.CACHE_CONNECTION_STRING,
  socket: {
    connectTimeout: 5000,
  },
})
  .on("sharded-channel-moved", () =>
    console.log("Redis sharded-channel-moved")
  )
  .on("connect", () => console.log("Redis connect"))
  .on("ready", () => console.log("Redis ready"))
  .on("reconnecting", () => console.log("Redis reconnecting"))
  .on("end", () => console.log("Redis end"))
  .on("error", (e) => console.log(`Redis error: ${e}`));

await redisClient.connect();

export const cache = new Cache(redisClient);
