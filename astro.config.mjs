import { defineConfig, envField } from "astro/config";
import tailwind from "@astrojs/tailwind";
import alpinejs from "@astrojs/alpinejs";
import netlify from "@astrojs/netlify";
import db from "@astrojs/db";
import clerk from "@clerk/astro";

// https://astro.build/config
export default defineConfig({
  site: "https://portal.getwisephone.com",
  integrations: [
    db(),
    tailwind(),
    alpinejs({
      entrypoint: "/src/entrypoint"
    }),
    clerk()
  ],
  vite: {
    optimizeDeps: {
      exclude: ["astro:db"]
    }
  },
  output: "server",
  adapter: netlify(),
  experimental: {
    serverIslands: true,
    env: {
      schema: {
        KNOX_REGION: envField.string({ context: "server", access: "public" }),
        KNOX_CLIENT_ID: envField.string({ context: "server", access: "secret" }),
        KNOX_CLIENT_SECRET: envField.string({ context: "server", access: "secret" }),
        OTTOGRID_API_KEY: envField.string({ context: "server", access: "secret" })
      }
    }
  }
});
