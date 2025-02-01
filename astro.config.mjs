import { defineConfig, envField } from "astro/config";
import tailwind from "@astrojs/tailwind";
import alpinejs from "@astrojs/alpinejs";
import netlify from "@astrojs/netlify";
import sentry from "@sentry/astro";
import db from "@astrojs/db";
import clerk from "@clerk/astro";
import lottie from "astro-integration-lottie";

const SENTRY_DSN = import.meta.env.SENTRY_DSN;
const SENTRY_AUTH_TOKEN = import.meta.env.SENTRY_AUTH_TOKEN;
const SENTRY_PROJECT = import.meta.env.SENTRY_PROJECT;
const isSentryEnabled = SENTRY_DSN && SENTRY_AUTH_TOKEN && SENTRY_PROJECT;

// https://astro.build/config
export default defineConfig({
  integrations: [
    db(),
    tailwind(),
    alpinejs({
      entrypoint: "/src/entrypoint"
    }),
    clerk(),
    lottie()
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
        KNOX_CLIENT_SECRET: envField.string({ context: "server", access: "secret" })
      }
    }
  }
});
