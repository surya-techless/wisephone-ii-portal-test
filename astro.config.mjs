import { defineConfig, envField } from "astro/config";
import { loadEnv } from "vite";
import tailwind from "@astrojs/tailwind";
import netlify from "@astrojs/netlify";
import db from "@astrojs/db";
import clerk from "@clerk/astro";
import sentry from "@sentry/astro";

const { SENTRY_AUTH_TOKEN } = loadEnv(process.env.NODE_ENV, process.cwd(), "");

// https://astro.build/config
export default defineConfig({
  site: "https://portal.wisephone.com",
  integrations: [
    db(),
    tailwind(),
    clerk(),
    sentry({
      dsn: "https://5eb13a77d6b20ea29b280f60280399db@o4508453437308928.ingest.us.sentry.io/4508887396974592",
      // This means we don't capture any video replays - Save Money
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      // debug: process.env.NODE_ENV !== "production",
      sourceMapsUploadOptions: {
        project: "wisephone-ii-portal",
        authToken: SENTRY_AUTH_TOKEN
      }
    })
  ],
  output: "server",
  adapter: netlify(),
  vite: {
    server: {
      // Enable HTTPS for local development
      // For production, Netlify automatically provides HTTPS
      https:
        process.env.HTTPS === "true"
          ? {
              // Use self-signed certificate (browser will show warning, but works for API calls)
              // For trusted certificates, use mkcert: https://github.com/FiloSottile/mkcert
              // After installing mkcert, run: mkcert -install && mkcert localhost 127.0.0.1 ::1
              // Then set: SSL_KEY_PATH=./localhost+2-key.pem SSL_CERT_PATH=./localhost+2.pem
              key: process.env.SSL_KEY_PATH || "./localhost-key.pem",
              cert: process.env.SSL_CERT_PATH || "./localhost.pem"
            }
          : false,
      port: process.env.PORT ? parseInt(process.env.PORT) : 4321,
      host: process.env.HOST || true,
      // Allow Cloudflare tunnel hosts and any trycloudflare.com subdomain
      allowedHosts: [".trycloudflare.com", "localhost", "127.0.0.1"]
    }
  },
  env: {
    schema: {
      GIGS_API_KEY: envField.string({ context: "server", access: "secret" }),
      STRIPE_SECRET_KEY: envField.string({ context: "server", access: "secret" }),
      PUBLIC_CLERK_PUBLISHABLE_KEY: envField.string({ context: "server", access: "public" }),
      CLERK_SECRET_KEY: envField.string({ context: "server", access: "secret" }),
      KNOX_REGION: envField.string({ context: "server", access: "public" }),
      KNOX_CLIENT_ID: envField.string({ context: "server", access: "secret" }),
      KNOX_CLIENT_SECRET: envField.string({ context: "server", access: "secret" }),
      OTTOGRID_API_KEY: envField.string({ context: "server", access: "secret" }),
      DEVICE_SYNC_API_KEY: envField.string({ context: "server", access: "secret" })
    }
  }
});
