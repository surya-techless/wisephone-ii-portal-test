import { createClient, type RedisClientType } from "redis";

export class Cache {
  private readonly errorMessageDefault = "❌ [Cache] A cache exception occurred:";
  
  constructor(private readonly client: any) { }

  public async getBufferSize(bufferId: string): Promise<number> {
    try {
      return await this.client.lLen(bufferId);
    } catch (e) {
      console.error(this.errorMessageDefault, e);
      return -1;
    }
  }

  public async getAllBufferContents(bufferId: string): Promise<string[]> {
    try {
      return await this.client.lRange(bufferId, 0, -1);
    } catch (e) {
      console.error(this.errorMessageDefault, e);
      return [];
    }
  }

  public async flush(bufferId: string): Promise<void> {
    try {
      let bufferLength: number = await this.getBufferSize(bufferId);
      await this.client.lTrim(bufferId, bufferLength, -1);
    } catch (e) {
      console.error(this.errorMessageDefault, e);
    }
  }

  public async get(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (e) {
      console.error(this.errorMessageDefault, e);
      return null;
    }
  }

  public async push(bufferId: string, value: string): Promise<void> {
    try {
      await this.client.rPush(bufferId, value);
    } catch (e) {
      console.error(this.errorMessageDefault, e);
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
  .on("connect", () => console.log("✅ [Cache] connected"))
  .on("ready", () => console.log("✅ [Cache] ready"))
  .on("reconnecting", () => console.log("⚠️ [Cache] reconnecting"))
  .on("end", () => console.log("⚠️ [Cache] end"))
  .on("error", (e) => console.log(`❌ [Cache] error: ${e}`));

await redisClient.connect();

export const cache = new Cache(redisClient);
