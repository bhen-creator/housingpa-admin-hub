import type { RequestHandler } from "express";

export function buildSecurityHeaders(isProduction: boolean) {
  const scriptSources = isProduction
    ? "script-src 'self'"
    : "script-src 'self' 'unsafe-eval'";
  const connectSources = isProduction
    ? "connect-src 'self'"
    : "connect-src 'self' ws: wss:";
  const upgradeInsecureRequests = isProduction
    ? "; upgrade-insecure-requests"
    : "";

  return {
    "Content-Security-Policy":
      [
        "default-src 'self'",
        "base-uri 'self'",
        connectSources,
        "font-src 'self' https://fonts.gstatic.com data:",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "img-src 'self' data: https:",
        "object-src 'none'",
        scriptSources,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      ].join("; ") + upgradeInsecureRequests,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-site",
    "Permissions-Policy":
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  } as Record<string, string>;
}

export function securityHeaders(isProduction: boolean): RequestHandler {
  const headers = buildSecurityHeaders(isProduction);
  return (_request, response, next) => {
    for (const [name, value] of Object.entries(headers))
      response.setHeader(name, value);
    if (isProduction) {
      response.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains"
      );
    }
    next();
  };
}
