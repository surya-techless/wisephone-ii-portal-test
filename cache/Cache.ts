import { createClient, type RedisClientType } from "redis";

export class Cache {
  private readonly errorMessageDefault = "❌ [Cache] A cache exception occurred:";
  
  constructor(private readonly client: any) { }

  public async getBufferSize(bufferId: string): Promise<number> {
    try {
      let size: number = await this.client.lLen(bufferId);
      console.log("✅ [Cache] LLEN success");
      return size;
    } catch (e) {
      console.error(this.errorMessageDefault, e);
      return -1;
    }
  }

  public async getAllBufferContents(bufferId: string): Promise<string[]> {
    try {
      let logs: string[] = await this.client.lRange(bufferId, 0, -1);
      console.log("✅ [Cache] LRANGE success");
      return logs;
    } catch (e) {
      console.error(this.errorMessageDefault, e);
      return [];
    }
  }

  public async flush(bufferId: string): Promise<void> {
    try {
      let bufferLength: number = await this.getBufferSize(bufferId);
      await this.client.lTrim(bufferId, bufferLength, -1);
      console.log("✅ [Cache] LTRIM (FLUSH) success");
    } catch (e) {
      console.error(this.errorMessageDefault, e);
    }
  }

  public async get(key: string): Promise<string | null> {
    try {
      let value: string = await this.client.get(key);
      console.log("✅ [Cache] GET success");
      return value;
    } catch (e) {
      console.error(this.errorMessageDefault, e);
      return null;
    }
  }

  public async push(bufferId: string, value: string): Promise<void> {
    try {
      await this.client.rPush(bufferId, value);
      console.log("✅ [Cache] RPUSH success");
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
