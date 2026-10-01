import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { pathToFileURL } from "node:url";

/**
 * Tiny deterministic fixture site used by the e2e test. Plain node http, no
 * framework. It is started only for tests and never exposed in production.
 */

interface Order {
  readonly id: string;
  readonly email: string;
  readonly cardLast4: string;
}

interface Submission {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly plan: string;
  readonly news: string;
  readonly notes: string;
}

const orders = new Map<string, Order>();
const submissions = new Map<string, Submission>();
let counter = 0;
let submissionCounter = 0;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function html(body: string): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Fixture</title></head>
<body>${body}</body>
</html>`;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function parseFields(
  raw: string,
  contentType: string | undefined,
): Record<string, string> {
  if (contentType?.includes("application/json") === true) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed))
        out[key] = String(value);
      return out;
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function sendHtml(
  response: ServerResponse,
  status: number,
  body: string,
): void {
  response.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  response.end(body);
}

function renderCheckout(): string {
  return html(`
<h1>Checkout</h1>
<form method="post" action="/orders">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required>
  <label for="card">Card number</label>
  <input id="card" name="card" inputmode="numeric" required>
  <button type="submit">Place order</button>
</form>`);
}

function renderConfirmation(order: Order): string {
  return html(`
<h1>Order received</h1>
<p>Order id: <span data-testid="order-id">${escapeHtml(order.id)}</span></p>`);
}

/**
 * A basic form that exercises the whole step DSL: text, email, select,
 * checkbox, and textarea fields, then a submit button into a result page.
 */
function renderForm(): string {
  return html(`
<h1>Basic form</h1>
<form method="post" action="/form">
  <label for="name">Full name</label>
  <input id="name" name="name" type="text" data-testid="name" required>
  <label for="email">Email</label>
  <input id="email" name="email" type="email" data-testid="email" required>
  <label for="plan">Plan</label>
  <select id="plan" name="plan" data-testid="plan">
    <option value="free">Free</option>
    <option value="pro">Pro</option>
    <option value="team">Team</option>
  </select>
  <label for="news">Subscribe to news</label>
  <input id="news" name="news" type="checkbox" data-testid="news">
  <label for="notes">Notes</label>
  <textarea id="notes" name="notes" data-testid="notes"></textarea>
  <button type="submit">Submit</button>
</form>`);
}

function renderSubmission(submission: Submission): string {
  return html(`
<h1>Submission received</h1>
<p>Submission id: <span data-testid="submission-id">${escapeHtml(submission.id)}</span></p>
<p>Name: <span data-testid="result-name">${escapeHtml(submission.name)}</span></p>
<p>Email: <span data-testid="result-email">${escapeHtml(submission.email)}</span></p>
<p>Plan: <span data-testid="result-plan">${escapeHtml(submission.plan)}</span></p>
<p>News: <span data-testid="result-news">${escapeHtml(submission.news)}</span></p>
<p>Notes: <span data-testid="result-notes">${escapeHtml(submission.notes)}</span></p>`);
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://fixture");
  const path = url.pathname;

  if (method === "GET" && path === "/healthz") {
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (method === "GET" && path === "/checkout") {
    sendHtml(response, 200, renderCheckout());
    return;
  }
  if (method === "GET" && path === "/form") {
    sendHtml(response, 200, renderForm());
    return;
  }
  if (method === "POST" && path === "/__reset") {
    orders.clear();
    submissions.clear();
    counter = 0;
    submissionCounter = 0;
    response.writeHead(204);
    response.end();
    return;
  }
  if (method === "POST" && path === "/orders") {
    const fields = parseFields(
      await readBody(request),
      request.headers["content-type"],
    );
    const email = fields["email"] ?? "";
    const card = fields["card"] ?? "";
    if (email === "" || card === "") {
      sendHtml(response, 400, html("<h1>Missing fields</h1>"));
      return;
    }
    counter += 1;
    const order: Order = {
      id: `ord_${1000 + counter}`,
      email,
      cardLast4: card.slice(-4),
    };
    orders.set(order.id, order);
    sendHtml(response, 201, renderConfirmation(order));
    return;
  }
  if (method === "GET" && path.startsWith("/orders/")) {
    const id = decodeURIComponent(path.slice("/orders/".length));
    const order = orders.get(id);
    if (order === undefined) {
      sendJson(response, 404, { error: "not found" });
      return;
    }
    sendJson(response, 200, order);
    return;
  }
  if (method === "POST" && path === "/form") {
    const fields = parseFields(
      await readBody(request),
      request.headers["content-type"],
    );
    const name = fields["name"] ?? "";
    const email = fields["email"] ?? "";
    if (name === "" || email === "") {
      sendHtml(response, 400, html("<h1>Missing fields</h1>"));
      return;
    }
    submissionCounter += 1;
    const submission: Submission = {
      id: `sub_${1000 + submissionCounter}`,
      name,
      email,
      plan:
        fields["plan"] === undefined || fields["plan"] === ""
          ? "free"
          : fields["plan"],
      news: fields["news"] === "on" ? "yes" : "no",
      notes: fields["notes"] ?? "",
    };
    submissions.set(submission.id, submission);
    sendHtml(response, 201, renderSubmission(submission));
    return;
  }
  if (method === "GET" && path.startsWith("/submissions/")) {
    const id = decodeURIComponent(path.slice("/submissions/".length));
    const submission = submissions.get(id);
    if (submission === undefined) {
      sendJson(response, 404, { error: "not found" });
      return;
    }
    sendJson(response, 200, submission);
    return;
  }

  sendJson(response, 404, { error: "not found" });
}

export function startFixture(
  port: number,
  host = "127.0.0.1",
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: "internal" });
      else response.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();
      const boundPort =
        typeof address === "object" && address !== null ? address.port : port;
      resolve({
        port: boundPort,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.FIXTURE_PORT ?? 4010);
  const host = process.env.FIXTURE_HOST ?? "127.0.0.1";
  startFixture(port, host).then(() => {
    process.stdout.write(`fixture listening on http://${host}:${port}\n`);
  });
}
