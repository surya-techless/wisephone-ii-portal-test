# Wisephone II Portal

With Wisephone II Portal, managing your devices has never been easier.

[Open Wisephone II Portal](https://portal.getwisephone.com)

## Features

- HTMX + Alpine.js for interactivity
- Astro DB (Turso) for data storage
- Clerk authentication

## Prerequisites

- Node.js v20.3.0 or higher
- NPM v10.0.0 or higher
- Clerk account
- Turso account
- Netlify account (recommended for deployment)

## Quick Start

1. Install dependencies

```bash
npm install
```

2. Set up environment variables

```bash
cp .env.example .env
```

3. Start development server

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run dev:remote` - Start with remote database
- `npm run dev:host` - Start with network access
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run db:update` - Update database schema
- `npm run format` - Format code with Prettier
- `npm run update-packages` - Update all packages

## Tech Stack

For a deeper dive into this tech stack, see the [Freedom Stack](https://github.com/cameronapak/freedom-stack).

- [Astro](https://astro.build)
- [Alpine.js](https://alpinejs.dev)
- [HTMX](https://htmx.org)
- [TailwindCSS](https://tailwindcss.com)
- [DaisyUI](https://daisyui.com)
- [Clerk](https://clerk.com)
- [Turso](https://turso.tech)

## Deployment

This project is optimized for deployment on Netlify.

## Support

Feel free to reach out on [X/Twitter](https://x.com/cameronpak) or [open an issue](https://github.com/cameronapak/kit/issues).
