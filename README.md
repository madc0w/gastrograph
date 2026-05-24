# Gastrograph

Nuxt 3 app with MongoDB connectivity and Heroku-ready deployment.

## Stack

- Nuxt 3 (SSR, Nitro node-server preset)
- MongoDB Node driver
- Heroku (Node.js buildpack)

## Environment Variables

Create `.env` based on `.env.example`:

```bash
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<db-name>?retryWrites=true&w=majority
MONGODB_DB=gastrograph
```

## Local Setup

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

Build production output:

```bash
npm run build
```

Run production server locally:

```bash
npm run start
```

## MongoDB Check Endpoint

The project includes `GET /api/health`, which pings MongoDB and returns an `ok` response when connected.

## Heroku Deployment

This repository includes:

- `Procfile`: runs `npm run start`
- `heroku-postbuild` script: builds Nuxt during Heroku slug compilation
- `engines.node`: Node.js version constraint for runtime compatibility

Deploy with Heroku CLI:

```bash
heroku create <your-app-name>
heroku config:set MONGODB_URI="<your-mongodb-uri>" MONGODB_DB="gastrograph"
git push heroku main
```

If your branch is `master`, use:

```bash
git push heroku master
```
