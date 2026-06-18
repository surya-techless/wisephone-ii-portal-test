import 'dotenv/config';
import { drizzle } from "drizzle-orm/mysql2";


const mysqldb = drizzle({ connection: { uri: process.env.DATABASE_URL }});
