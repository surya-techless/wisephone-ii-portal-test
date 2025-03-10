import { defineConfig, envField } from "astro/config";
import tailwind from "@astrojs/tailwind";
import alpinejs from "@astrojs/alpinejs";
import netlify from "@astrojs/netlify";
import db from "@astrojs/db";
import clerk from "@clerk/astro";
import sentry from "@sentry/astro";

// https://astro.build/config
export default defineConfig({
  site: "https://portal.getwisephone.com",
  integrations: [
    db(),
    tailwind(),
    alpinejs({
      entrypoint: "/src/entrypoint"
    }),
    clerk(),
    sentry({
      dsn: "https://5eb13a77d6b20ea29b280f60280399db@o4508453437308928.ingest.us.sentry.io/4508887396974592",
      // This means we don't capture any video replays - Save Money
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      sourceMapsUploadOptions: {
        project: "wisephone-ii-portal",
        authToken: process.env.SENTRY_AUTH_TOKEN
      }
    })
  ],
  vite: {
    optimizeDeps: {
      exclude: ["astro:db"]
    }
  },
  output: "server",
  adapter: netlify(),
  env: {
    schema: {
      GIGS_API_KEY: envField.string({ context: "server", access: "secret" }),
      STRIPE_SECRET_KEY: envField.string({ context: "server", access: "secret" }),
      PUBLIC_CLERK_PUBLISHABLE_KEY: envField.string({ context: "server", access: "public" }),
      CLERK_SECRET_KEY: envField.string({ context: "server", access: "secret" }),
      KNOX_REGION: envField.string({ context: "server", access: "public" }),
      KNOX_CLIENT_ID: envField.string({ context: "server", access: "secret" }),
      KNOX_CLIENT_SECRET: envField.string({ context: "server", access: "secret" }),
      OTTOGRID_API_KEY: envField.string({ context: "server", access: "secret" })
    }
  }
});
