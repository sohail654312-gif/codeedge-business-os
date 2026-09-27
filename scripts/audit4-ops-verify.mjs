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

const readiness = await readJson("/api/health/ready");
if (
  readiness.response.status !== 200
  || readiness.body?.status !== "ready"
) {
  throw new Error(
    `Readiness check failed with HTTP ${readiness.response.status}.`,
  );
}

const automation = await readJson("/api/internal/automation/health", {
  headers: {
    Authorization: `Bearer ${automationSecret}`,
  },
});

if (
  automation.response.status !== 200
  || automation.body?.status !== "ok"
  || automation.body?.healthy !== true
) {
  throw new Error(
    `Automation health check failed with HTTP ${automation.response.status}.`,
  );
}

process.stdout.write(JSON.stringify({
  host: readiness.host,
  readiness: readiness.body?.status,
  automation: {
    status: automation.body?.status,
    healthy: automation.body?.healthy,
    pendingCount: automation.body?.pendingCount,
    runningCount: automation.body?.runningCount,
    staleRunningCount: automation.body?.staleRunningCount,
    oldestPendingAgeSeconds: automation.body?.oldestPendingAgeSeconds,
  },
}, null, 2) + "\n");
