import { DAILY_IDEA_GENERATOR_PUBLIC_ROUTE } from "@shared/toolCatalog";

export const DAILY_IDEA_GENERATOR_HEALTH_ROUTE = new URL(
  "healthz",
  DAILY_IDEA_GENERATOR_PUBLIC_ROUTE
).toString();

export const DAILY_IDEA_GENERATOR_VERIFICATION_TIMEOUT_MS = 8_000;

export class DailyIdeaGeneratorVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyIdeaGeneratorVerificationError";
  }
}

type VerificationOptions = {
  fetchImplementation?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
};

export type DailyIdeaGeneratorVerification = {
  destinationUrl: typeof DAILY_IDEA_GENERATOR_PUBLIC_ROUTE;
  evidence: string;
  verifiedAt: Date;
};

function verificationFailure(message: string): never {
  throw new DailyIdeaGeneratorVerificationError(message);
}

function verificationSignal(timeoutMs: number) {
  if (
    typeof AbortSignal === "undefined" ||
    typeof AbortSignal.timeout !== "function"
  ) {
    verificationFailure(
      "The server cannot enforce a verification timeout. Nothing was published."
    );
  }
  return AbortSignal.timeout(timeoutMs);
}

async function requestExpectedResponse(
  fetchImplementation: typeof fetch,
  route: string,
  timeoutMs: number
) {
  try {
    return await fetchImplementation(route, {
      method: "GET",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      headers: { accept: "text/html, application/json;q=0.9" },
      signal: verificationSignal(timeoutMs),
    });
  } catch {
    verificationFailure(
      "The canonical Daily Idea Generator route could not be verified. Nothing was published."
    );
  }
}

function requireSuccessfulResponse(response: Response, label: string) {
  if (!response.ok || response.status !== 200) {
    verificationFailure(
      `The Daily Idea Generator ${label} check did not return the expected HTTP 200 response. Nothing was published.`
    );
  }
}

function requireHtmlResponse(response: Response) {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("text/html")) {
    verificationFailure(
      "The Daily Idea Generator route did not return the expected HTML application response. Nothing was published."
    );
  }
}

async function requireExpectedApplicationPage(response: Response) {
  requireSuccessfulResponse(response, "application route");
  requireHtmlResponse(response);

  const html = await response.text();
  if (!html.includes('id="app"') && !html.includes("id='app'")) {
    verificationFailure(
      "The Daily Idea Generator route did not return the expected application shell. Nothing was published."
    );
  }
}

async function requireExpectedHealthResponse(response: Response) {
  requireSuccessfulResponse(response, "health");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    verificationFailure(
      "The Daily Idea Generator health check did not return the expected JSON response. Nothing was published."
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    verificationFailure(
      "The Daily Idea Generator health check returned unreadable data. Nothing was published."
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    (body as { ok?: unknown }).ok !== true ||
    (body as { configured?: unknown }).configured !== true
  ) {
    verificationFailure(
      "The Daily Idea Generator health check was not ready and configured. Nothing was published."
    );
  }
}

/**
 * Verifies the sole public route that the Admin Hub may publish for the Daily
 * Idea Generator. This function intentionally accepts no route parameter, so
 * the admin operation cannot be repurposed as a server-side URL fetcher.
 */
export async function verifyDailyIdeaGenerator({
  fetchImplementation = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = DAILY_IDEA_GENERATOR_VERIFICATION_TIMEOUT_MS,
}: VerificationOptions = {}): Promise<DailyIdeaGeneratorVerification> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    verificationFailure(
      "The verification timeout is invalid. Nothing was published."
    );
  }

  const applicationResponse = await requestExpectedResponse(
    fetchImplementation,
    DAILY_IDEA_GENERATOR_PUBLIC_ROUTE,
    timeoutMs
  );
  await requireExpectedApplicationPage(applicationResponse);

  const healthResponse = await requestExpectedResponse(
    fetchImplementation,
    DAILY_IDEA_GENERATOR_HEALTH_ROUTE,
    timeoutMs
  );
  await requireExpectedHealthResponse(healthResponse);

  const verifiedAt = now();
  if (Number.isNaN(verifiedAt.getTime())) {
    verificationFailure(
      "The verification timestamp is invalid. Nothing was published."
    );
  }

  return {
    destinationUrl: DAILY_IDEA_GENERATOR_PUBLIC_ROUTE,
    evidence:
      "Canonical application and ready health checks returned expected HTTP 200 responses.",
    verifiedAt,
  };
}
