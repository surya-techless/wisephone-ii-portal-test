import 'dotenv/config';
import { drizzle } from "drizzle-orm/mysql2";


export const mysqldb = drizzle({connection: {uri: process.env.MYSQL_CONNECTION_URL}});
