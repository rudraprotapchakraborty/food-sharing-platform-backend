# Food Sharing Platform · API

REST API for the [Food Sharing Platform](https://food-sharing-platform-frontend-chi.vercel.app/) ([frontend repository](https://github.com/rudraprotapchakraborty/food-sharing-platform-frontend)). Deployed at [food-sharing-platform-backend-blush.vercel.app](https://food-sharing-platform-backend-blush.vercel.app/). Express 5, TypeScript, MongoDB (Mongoose) and Zod.

## Features

- Public listings with search, category and status filters, sorting and pagination. Food past its collection deadline is hidden from the default list
- Listings belong to the member who shared them: only the donor (or an admin) can edit, remove or hand over. Fields are validated, unknown fields are ignored, so nobody can fake a donor or a status
- Request flow with real rules: you cannot request your own food, only available and unexpired food can be requested, and there is one live request per person per food (enforced by a partial unique index). Accepting is atomic, reserves the food and declines the other waiting requests. Cancelling an accepted request, or deleting an account, puts reserved food back on the list
- Privacy by design: a listing never exposes the donor's email. Emails are revealed only between the donor and the one accepted requester
- Auth: email and password with a six digit email code (HMAC-hashed, 10 minute expiry, 5 attempts, 60 second resend), Google ID-token sign-in, forgot and reset password
- Account: change name and photo, password, email (code sent to the new address), delete account with confirmation (removes the member's listings and requests)
- Roles `USER` and `ADMIN`, with member management and statistics for admins
- Shared demo accounts that are locked down: no sign-in or profile changes, no deletion, cannot touch the sample listings, cannot ask real members for food, and a demo admin only sees demo data
- Helmet, CORS allow list, rate limits, and the JWT is checked against the database on each request so blocks and role changes apply immediately

## Run it locally

```bash
npm install
cp .env.example .env     # fill in the values
npm run dev              # http://localhost:5000
npm run seed             # sample listings, requests and demo accounts
```

`npm run seed:clear` removes the demo data again. Only accounts flagged as demo, and the listings and requests that belong to them, are ever touched.

The sample listings live in `scripts/foods.seed.json`: 24 listings (the nine from the first version of the site plus fifteen more) with free-licensed photos from Wikipedia. Collection deadlines are set relative to the moment you run the seed.

## Environment

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI`, `MONGODB_DB` | Database connection. The app uses its own database (default `food_sharing`). |
| `JWT_ACCESS_SECRET` | Secret for signing tokens and hashing codes. |
| `CLIENT_URL` | Comma separated list of allowed browser origins. Defaults to localhost and the live frontend. |
| `GOOGLE_CLIENT_ID` | Google OAuth client id used to verify ID tokens. |
| `SMTP_*`, `MAIL_FROM`, `RESEND_API_KEY` | Email delivery (SMTP first, Resend as fallback). Without either, codes are printed to the console in development. |
| `IMGBB_API_KEY` | Hosts profile photos. |

## API overview

All routes live under `/api`. Responses look like `{ "success": true, "data": ... }`.

| Area | Routes |
| --- | --- |
| Foods | `GET /foods` (`q`, `category`, `status`, `sort`, `page`, `limit`), `/foods/soon`, `/foods/categories`, `/foods/mine`, `/foods/:id`, `POST /foods`, `PATCH /foods/:id`, `DELETE /foods/:id`, `POST /foods/:id/donated`, `POST /foods/:id/reopen` |
| Requests | `POST /requests`, `GET /requests/mine`, `GET /requests/incoming`, `GET /requests/for-food/:foodId`, `POST /requests/:id/accept`, `/decline`, `/cancel` |
| Auth | `POST /auth/register`, `/auth/verify-email`, `/auth/resend-otp`, `/auth/login`, `/auth/google`, `/auth/forgot-password`, `/auth/reset-password`, `GET /auth/demo-accounts` |
| Account | `GET/PATCH /users/me/self`, `GET /users/me/methods`, `POST /users/me/password`, `POST` and `PUT /users/me/email`, `DELETE /users/me` |
| Admin | `GET /admin/stats`, `GET /admin/users`, `PATCH /admin/users/:userId`, `DELETE /admin/users/:userId` |
| Other | `POST /uploads/image`, `GET /public/stats`, `GET /health` |

## Deploying

Vercel is supported out of the box: `api/index.ts` is the serverless entry and `vercel.json` rewrites every request to it (the MongoDB connection is cached between invocations). Set the environment variables above in the project settings, including `CLIENT_URL`.
