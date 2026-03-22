const backendUrl = process.env.BACKEND_URL ?? 'http://backend:3001';
const adminToken = process.env.ADMIN_TOKEN ?? 'super-secret-admin-token-change-me';
const dataDir = process.env.DATA_DIR ?? '/app/data';
const maxAttempts = Number(process.env.BOOTSTRAP_MAX_ATTEMPTS ?? 60);
const delayMs = Number(process.env.BOOTSTRAP_DELAY_MS ?? 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBackend() {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${backendUrl}/api/docs-json`);
      if (response.ok) {
        console.log(`Backend is ready after ${attempt} attempt(s)`);
        return;
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
    }

    console.log(`Waiting for backend (${attempt}/${maxAttempts})...`);
    await sleep(delayMs);
  }

  throw new Error('Backend did not become ready in time');
}

async function fetchStations() {
  const response = await fetch(`${backendUrl}/node/stations`);
  if (!response.ok) {
    throw new Error(`Failed to check existing stations: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function bootstrapData() {
  const response = await fetch(`${backendUrl}/admin/import-bootstrap`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken,
    },
    body: JSON.stringify({ dataDir }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bootstrap failed: ${response.status} ${response.statusText}\n${body}`);
  }

  const result = await response.json();
  console.log('Bootstrap completed');
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  await waitForBackend();

  const stations = await fetchStations();
  if (Array.isArray(stations) && stations.length > 0) {
    console.log(`Skipping bootstrap: found ${stations.length} existing station(s)`);
    return;
  }

  await bootstrapData();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
