import express from 'express';
import fetch from 'node-fetch';  // Ensure you install 'node-fetch' as a dependency
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

let cached = null;
let inflight = null;

async function fetchTokenFromSalesforce() {
  const SF_INSTANCE = process.env.VITE_API_URL;
  const CLIENT_ID = process.env.VITE_SF_CLIENT_ID;
  const CLIENT_SECRET = process.env.VITE_SF_CLIENT_SECRET;

  if (!SF_INSTANCE || !CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('Missing SF_INSTANCE_URL / SF_CLIENT_ID / SF_CLIENT_SECRET env vars');
  }

  const url = `${SF_INSTANCE.replace(/\/$/, '')}/services/oauth2/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);

  const resp = await fetch(url, {
    method: 'POST',
    body: params.toString(),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Token endpoint returned ${resp.status}: ${body}`);
  }

  const data = await resp.json();
  if (!data.access_token) throw new Error('No access_token in response');

  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 300;
  data.expires_at = Date.now() + expiresIn * 1000;
  return data;
}

async function getToken() {
  if (cached && Date.now() + 10000 < cached.expires_at) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const token = await fetchTokenFromSalesforce();
      cached = token;
      return token;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

app.use(cors());
app.use(express.json());

// Token API
app.get('/api/token', async (req, res) => {
  try {
    const token = await getToken();
    return res.status(200).json({
      access_token: token.access_token,
      token_type: token.token_type,
      issued_at: token.issued_at || Date.now(),
      expires_at: token.expires_at
    });
  } catch (err) {
    console.error('Token fetch error', err);
    return res.status(500).json({ error: 'token_fetch_failed', detail: String(err.message) });
  }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
