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
- `npm run test:e2e` - Run end-to-end tests with Playwright
- `npm run test:gui` - Run tests with Playwright's GUI

## Testing

This project uses Playwright for end-to-end testing. Tests are located in the `tests` directory.

### Running Tests

```bash
# Run all tests in headless mode
npm run test:e2e

# Run tests with Playwright's interactive UI
npm run test:gui
```

### Interpreting Test Results

- Playwright tests output results in the terminal showing passed/failed tests
- Failed tests include screenshots and traces for debugging
- When using `test:gui`, you can:
  - View test execution in real-time
  - Inspect element selectors
  - Step through test execution
  - View and debug test traces

### Test Configuration

Tests run against multiple browsers (Chrome, Safari) and are configured in `playwright.config.ts`.
The testing environment integrates with Clerk for authentication testing via `global.setup.ts`.

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
