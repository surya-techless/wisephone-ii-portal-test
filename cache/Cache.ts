import { createClient, type RedisClientType } from "redis";

export class Cache {
  // assume that each device encounters 1 error event every 10 minutes:
  // 20000 error events every 10 minutes
  // 2000 error events / minute
  // 33.3 error events / second

  // buffer threshold of 5000 = 1 bulk db insert every 2.5 minutes
  public static readonly bufferSizeNumKeys = Number(process.env.BUFFER_SIZE_NUM_MESSAGES);
  private readonly errorMessageDefault = "A cache exception occurred:";

  // for concurrency safety: netlify dynamically scales app instances depedning on traffic
  // simplest mechanism is to simply write to different cache "namespaces" across any number of app instances
  private currentDate: string = new Intl.DateTimeFormat('en-US').format(new Date());
  private bufferIdPrefix: string = `wisephone-portal-logFlushBuffer-${this.currentDate}-`;
  public  bufferId: string;

  constructor(private readonly client: any) {
    this.bufferId = this.getRefreshedBufferId();
  }

  private getRefreshedBufferId(): string { return this.bufferIdPrefix + crypto.randomUUID() }

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
      this.bufferId = this.getRefreshedBufferId();
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
  .on("connect", () => console.log("Redis connect"))
  .on("ready", () => console.log("Redis ready"))
  .on("reconnecting", () => console.log("Redis reconnecting"))
  .on("end", () => console.log("Redis end"))
  .on("error", (e) => console.log(`Redis error: ${e}`));

await redisClient.connect();

export const cache = new Cache(redisClient);
