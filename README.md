# Scores API (Cloud Run-ready)

Express + MySQL scores API.

## Endpoints

GET `/health`

GET `/scores?game=yourgame`

POST `/scores`

Body:

{
  "data": "<base64 of json>"
}

Decoded JSON example:

{
  "name": "Player",
  "score": 123,
  "game": "test"
}

---

# Local development

Install dependencies

npm install

Create `.env`

cp .env.example .env

Run server

npm run dev

Test endpoints

http://localhost:8080/health

http://localhost:8080/scores?game=test

---

# Deploy with Cloud Run (Connect Repository)

1. Push repo to GitHub
2. Open Google Cloud Console
3. Go to Cloud Run
4. Click **Create Service**
5. Choose **Continuously deploy from repository**
6. Connect your GitHub repository
7. Select branch

Build type:

Buildpacks

Environment variables:

DB_HOST
DB_USER
DB_PASS
DB_NAME

Cloud Run automatically sets:

PORT

Deploy and use the generated service URL.