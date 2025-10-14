# Account Setup Guide for Dev Server

This guide will walk you through creating accounts and getting API keys for all required environment variables.

---

## 🟢 **Accounts You MUST Create** (Required for Dev Server)

### 1. **Astro Studio** (Database)

**What it's for:** Remote database for your portal  
**Cost:** FREE (generous free tier)  
**Priority:** ⭐⭐⭐ **CRITICAL** - Portal won't work without this

#### Steps:
1. **Visit:** https://studio.astro.build
2. **Sign in** with GitHub (use your surya-techless account)
3. **Create New Project:**
   - Click "Create Project"
   - Name: `wisephone-portal-dev` (or similar)
   - Region: Choose closest to you (US East recommended)
   - Click "Create"

4. **Get Token:**
   - Go to project Settings → Tokens
   - Click "Create Token"
   - Name: `netlify-dev-deployment`
   - Copy the token (starts with `astro_...`)
   - Save as: `ASTRO_STUDIO_APP_TOKEN`

5. **Push Database Schema:**
   ```bash
   cd wisephone-ii-portal
   export ASTRO_STUDIO_APP_TOKEN="your-token-here"
   npm run db:update
   ```

**Result:** You get `ASTRO_STUDIO_APP_TOKEN`

---

### 2. **Clerk** (Authentication)

**What it's for:** User authentication and login  
**Cost:** FREE for development (up to 10,000 MAU)  
**Priority:** ⭐⭐⭐ **CRITICAL** - Users can't log in without this

#### Steps:
1. **Visit:** https://clerk.com
2. **Sign up** or sign in
3. **Create Application:**
   - Click "Add application"
   - Name: `Wisephone Portal Dev`
   - Select: "Email" and "Phone" as sign-in methods
   - Click "Create Application"

4. **Configure Application:**
   - Go to **Configure → Paths**
   - Set Sign-in URL: `/sign-in`
   - Set Sign-up URL: `/sign-up`
   - Set After sign in: `/dashboard`

5. **Get API Keys:**
   - Go to **API Keys** (in left sidebar)
   - Copy **Publishable key** → Save as `PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Copy **Secret key** → Save as `CLERK_SECRET_KEY`

6. **Add Allowed Domains (Important!):**
   - Go to **Domains** (in left sidebar)
   - Add your Netlify dev URL when you get it (e.g., `your-site-dev.netlify.app`)
   - Add localhost: `http://localhost:4321` (for local testing)

**Result:** You get `PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`

---

### 3. **Stripe** (Payments)

**What it's for:** Process subscription payments  
**Cost:** FREE (test mode has no costs)  
**Priority:** ⭐⭐⭐ **CRITICAL** - Subscription management won't work

#### Options:

**Option A: Use Existing Company Account** (Recommended)
- Ask your team lead for the Stripe **TEST** API key
- They should give you: `sk_test_...`
- Save as: `STRIPE_SECRET_KEY`

**Option B: Create Your Own Test Account**
1. **Visit:** https://stripe.com
2. **Sign up** for a new account
3. **Switch to Test Mode** (toggle in top right)
4. **Get API Key:**
   - Go to Developers → API keys
   - Copy **Secret key** (starts with `sk_test_...`)
   - Save as: `STRIPE_SECRET_KEY`

**Important:** Always use TEST keys for dev server!

**Result:** You get `STRIPE_SECRET_KEY` (test key)

---

## 🟡 **Company Accounts** (Ask Your Team Lead)

These likely already exist as company accounts. You should **ask your team lead** for access rather than creating new ones.

### 4. **Samsung Knox** (Device Management)

**What it's for:** Remote device management and app installation  
**Cost:** Enterprise (company should have this)  
**Priority:** ⭐⭐ **Important** - Needed for device features

#### What to Ask For:
- Knox region: `KNOX_REGION` (e.g., "US", "EU")
- Knox client ID: `KNOX_CLIENT_ID`
- Knox client secret: `KNOX_CLIENT_SECRET`

**If company doesn't have Knox:**
- Contact: https://www.samsungknox.com/en/knox-platform
- This is an enterprise service and requires Samsung approval
- **For dev testing:** You might be able to skip this temporarily

**Result:** You get `KNOX_REGION`, `KNOX_CLIENT_ID`, `KNOX_CLIENT_SECRET`

---

### 5. **Gigs** (SIM/Cellular Management)

**What it's for:** Manage cellular connectivity and SIM cards  
**Cost:** Enterprise/Partner program  
**Priority:** ⭐⭐ **Important** - Needed for cellular features

#### What to Ask For:
- Gigs API key: `GIGS_API_KEY`
- This is a company account - ask your team lead

**If company doesn't have Gigs:**
- Contact: https://gigs.com
- This is typically an enterprise partnership
- **For dev testing:** You might be able to skip this temporarily

**Result:** You get `GIGS_API_KEY`

---

### 6. **Ottogrid** (App Catalog)

**What it's for:** Fetch available apps for installation  
**Cost:** Unknown (likely company account)  
**Priority:** ⭐⭐ **Important** - Needed for app management

#### What to Ask For:
- Ottogrid API key: `OTTOGRID_API_KEY`
- This is likely a company account

**If company doesn't have Ottogrid:**
- Check if there's an alternative app catalog API
- Contact your team lead for alternatives
- **For dev testing:** You might be able to use mock data

**Result:** You get `OTTOGRID_API_KEY`

---

## 🔵 **Optional but Recommended**

### 7. **Sentry** (Error Tracking)

**What it's for:** Track errors and monitor application health  
**Cost:** FREE for small projects (generous free tier)  
**Priority:** ⭐ **Nice to have** - Helps with debugging

#### Steps:
1. **Visit:** https://sentry.io
2. **Sign up** (free account)
3. **Create Project:**
   - Select "Astro" as platform
   - Name: `wisephone-portal-dev`
   - Click "Create Project"

4. **Get Auth Token:**
   - Go to Settings → Account → API → Auth Tokens
   - Click "Create New Token"
   - Scopes: Select `project:releases` (for source maps)
   - Click "Create Token"
   - Copy token → Save as: `SENTRY_AUTH_TOKEN`

5. **Get DSN (Optional):**
   - In your project settings, copy the DSN
   - Update in `astro.config.mjs` if you want separate dev tracking

**Note:** The production Sentry is already configured in the codebase. You can:
- Use the same Sentry project (errors from dev will go to same place)
- Create a separate project for cleaner separation

**Result:** You get `SENTRY_AUTH_TOKEN`

---

## 📋 Environment Variables Checklist

After setting up accounts, you should have:

### Required for Basic Functionality:
- [ ] `ASTRO_STUDIO_APP_TOKEN` - from Astro Studio
- [ ] `PUBLIC_CLERK_PUBLISHABLE_KEY` - from Clerk
- [ ] `CLERK_SECRET_KEY` - from Clerk
- [ ] `STRIPE_SECRET_KEY` - from Stripe (TEST key)
- [ ] `NODE_ENV` - set to `development` (manual)

### Required for Full Functionality:
- [ ] `KNOX_REGION` - from Samsung Knox (ask team)
- [ ] `KNOX_CLIENT_ID` - from Samsung Knox (ask team)
- [ ] `KNOX_CLIENT_SECRET` - from Samsung Knox (ask team)
- [ ] `GIGS_API_KEY` - from Gigs (ask team)
- [ ] `OTTOGRID_API_KEY` - from Ottogrid (ask team)

### Optional:
- [ ] `SENTRY_AUTH_TOKEN` - from Sentry (for source maps)

---

## 🚀 Quick Start Priority

**If you want to get started quickly**, here's the minimum you need:

### Phase 1: Basic Setup (Can deploy and test auth)
1. ✅ Create **Astro Studio** account → Get database token
2. ✅ Create **Clerk** account → Get auth keys
3. ✅ Use existing **Stripe test key** or create account

**You can now:**
- Deploy to Netlify
- Test user authentication
- Access basic portal features

### Phase 2: Full Functionality (Later)
4. Get **Knox credentials** from team
5. Get **Gigs API key** from team
6. Get **Ottogrid API key** from team

**You can now:**
- Manage devices
- Install apps
- Full portal functionality

---

## 📝 Summary Table

| Variable | Create Account? | Where to Get It | Time |
|----------|----------------|-----------------|------|
| `ASTRO_STUDIO_APP_TOKEN` | ✅ Yes | https://studio.astro.build | 5 min |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | ✅ Yes | https://clerk.com | 10 min |
| `CLERK_SECRET_KEY` | ✅ Yes | https://clerk.com | (same) |
| `STRIPE_SECRET_KEY` | ⚠️ Maybe | Ask team or https://stripe.com | 5 min |
| `KNOX_*` | ❌ No | Ask team lead | - |
| `GIGS_API_KEY` | ❌ No | Ask team lead | - |
| `OTTOGRID_API_KEY` | ❌ No | Ask team lead | - |
| `SENTRY_AUTH_TOKEN` | ⚠️ Optional | https://sentry.io | 5 min |
| `NODE_ENV` | ✅ Manual | Set to "development" | 1 sec |

---

## 💡 Tips

1. **For Testing:** Start with Phase 1 accounts (Astro, Clerk, Stripe)
2. **Use Test Keys:** Always use test/sandbox keys for dev server
3. **Separate Instances:** Create separate dev instances for Clerk and Astro (don't use production)
4. **Save Securely:** Store all keys in a password manager
5. **Team Variables:** For Knox, Gigs, Ottogrid - ask in your team Slack/chat

---

## 🆘 What to Ask Your Team Lead

Send this message to your team lead:

```
Hi! I'm setting up a dev server for the portal on Netlify.

I've created my own accounts for:
- Astro Studio (database)
- Clerk (auth)
- Stripe test mode (payments)

Could you please provide the following API credentials for the dev environment?
- Samsung Knox: KNOX_REGION, KNOX_CLIENT_ID, KNOX_CLIENT_SECRET
- Gigs API: GIGS_API_KEY
- Ottogrid: OTTOGRID_API_KEY

Or let me know if I should use the production credentials for testing, or if we have separate dev credentials.

Thanks!
```

---

## Next Steps

1. ✅ Create accounts from **Phase 1** (Astro, Clerk, Stripe)
2. ✅ Ask team lead for **Phase 2** credentials
3. ✅ Add all variables to Netlify dashboard
4. ✅ Deploy to Netlify dev server
5. ✅ Test the deployment

Good luck! 🎉

