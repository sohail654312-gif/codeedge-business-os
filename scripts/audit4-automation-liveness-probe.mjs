const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const baseUrl = new URL(required("AUDIT4_BASE_URL"));
if (baseUrl.protocol !== "https:" && process.env.AUDIT4_ALLOW_HTTP !== "1") {
  throw new Error("AUDIT4_BASE_URL must use HTTPS.");
}

const automationSecret = required("AUTOMATION_RUNNER_SECRET");

async function readJson(path, init = {}) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    // Keep diagnostics non-sensitive and avoid reflecting arbitrary HTML.
  }

  return { response, body, host: url.host };
}

const probe = await readJson("/api/internal/automation/run?probe=1", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${automationSecret}`,
  },
});

if (
  probe.response.status !== 200
  || probe.body?.probe !== true
  || probe.body?.status !== "ok"
  || probe.body?.healthy !== true
) {
  throw new Error(
    `Automation liveness probe failed with HTTP ${probe.response.status}.`,
  );
}

const health = await readJson("/api/internal/automation/health", {
  headers: {
    Authorization: `Bearer ${automationSecret}`,
  },
});

if (
  health.response.status !== 200
  || health.body?.status !== "ok"
  || health.body?.healthy !== true
) {
  throw new Error(
    `Automation health check failed with HTTP ${health.response.status}.`,
  );
}

process.stdout.write(JSON.stringify({
  host: probe.host,
  probe: {
    status: probe.body?.status,
    healthy: probe.body?.healthy,
    pendingCount: probe.body?.pendingCount,
    runningCount: probe.body?.runningCount,
    staleRunningCount: probe.body?.staleRunningCount,
    oldestPendingAgeSeconds: probe.body?.oldestPendingAgeSeconds,
  },
  health: {
    status: health.body?.status,
    healthy: health.body?.healthy,
  },
}, null, 2) + "\n");
