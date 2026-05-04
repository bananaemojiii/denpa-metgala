// UMA resolve service — HTTP server that accepts assertion requests and
// manages the on-chain dispute window for Denpa market resolution.
//
// POST /assert  { ticker, outcome: "yes"|"no", note? }  → starts UMA assertion
// GET  /status  → lists all active assertions + expiry times
//
// Called by:
//   apps/web/app/api/admin/resolve  (via UMA_RESOLVE_SERVICE_URL env var)
import { assertMarketOutcome, getAssertions } from "./asserter.ts";
import { startSettlementListener, trackAssertion } from "./listener.ts";

const PORT = Number(process.env.PORT ?? 3001);
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? "";

function authOk(req: Request): boolean {
  if (!ADMIN_SECRET) return false;
  return req.headers.get("authorization") === `Bearer ${ADMIN_SECRET}`;
}

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/assert" && req.method === "POST") {
      if (!authOk(req)) return new Response("Unauthorized", { status: 401 });

      let body: { ticker: string; outcome: "yes" | "no"; note?: string };
      try {
        body = await req.json();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }

      const { ticker, outcome, note } = body;
      if (!ticker || !["yes", "no"].includes(outcome)) {
        return new Response("ticker and outcome required", { status: 400 });
      }

      // Non-blocking — assertion + settlement happen async
      assertMarketOutcome(ticker, outcome, note)
        .then((record) => {
          trackAssertion(record);
        })
        .catch((e) => console.error("[worker] assertMarketOutcome failed:", e));

      return Response.json({ ok: true, ticker, outcome });
    }

    if (url.pathname === "/status" && req.method === "GET") {
      if (!authOk(req)) return new Response("Unauthorized", { status: 401 });
      const assertions = [...getAssertions().values()].map((r) => ({
        ...r,
        expiresIn: Math.max(0, r.expiresAt - Date.now()),
      }));
      return Response.json({ assertions });
    }

    return new Response("Not found", { status: 404 });
  },
});

startSettlementListener();
console.log(`[resolve-worker] listening on :${PORT}`);
