const secretKey = /(?:password|passwd|pwd|token|api[_-]?key|api[_-]?secret|authorization|cookie|csrf|session|sid)/i;

export function redactText(value: string, configuredSecret?: string): string {
  let result = configuredSecret ? value.replaceAll(configuredSecret, "[redacted]") : value;
  result = result.replace(/\bBearer\s+[^\s,;"'}]+/gi, "Bearer [redacted]");
  result = result.replace(/((?:password|passwd|pwd|token|api[_-]?key|api[_-]?secret|authorization|csrf[_-]?token)["']?\s*[=:]\s*["']?)[^\s&,;"'}]+/gi, "$1[redacted]");
  return result;
}

export function redactValue(value: unknown, configuredSecret?: string): unknown {
  if (typeof value === "string") return redactText(value, configuredSecret);
  if (Array.isArray(value)) return value.map(item => redactValue(item, configuredSecret));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, secretKey.test(key) ? "[redacted]" : redactValue(item, configuredSecret),
    ]));
  }
  return value;
}

export function redactUrl(raw: string, configuredSecret?: string): string {
  const url = new URL(raw);
  for (const key of url.searchParams.keys()) {
    if (secretKey.test(key)) url.searchParams.set(key, "[redacted]");
  }
  return redactText(url.toString(), configuredSecret);
}

export function redactBody(body: string | null, configuredSecret?: string): unknown {
  if (!body) return null;
  let value: unknown;
  try { value = JSON.parse(body); } catch {
    try {
      const params = new URLSearchParams(body);
      value = [...params.keys()].length && body.includes("=") ? Object.fromEntries(params) : body;
    } catch { value = body; }
  }
  return redactValue(value, configuredSecret);
}
