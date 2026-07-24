// Liveness probe. Intentionally dependency-free (no DB/Redis call) so a green
// response means "the web process is up and serving," which is what load
// balancers / Render health checks want. A deeper readiness check that pings
// Postgres + Redis can live at /api/health/ready in a later milestone.
export function GET(): Response {
  return Response.json({ status: 'ok', service: 'web' });
}
