const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

export function isPrivateIpv4Literal(ip: string) {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  const d = Number(m[4]);
  if ([a, b, c, d].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export function isPrivateIpv6Literal(host: string) {
  const h = host.toLowerCase();
  if (h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local
  if (h.startsWith("fe80:")) return true; // link-local
  return false;
}

export function isBlockedHostname(hostnameInput: string) {
  const hostname = hostnameInput.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(hostname)) return true;
  if (hostname.endsWith(".local")) return true;
  if (isPrivateIpv4Literal(hostname)) return true;
  if (hostname.includes(":") && isPrivateIpv6Literal(hostname)) return true;
  return false;
}

export function parseAndValidateTarget(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false as const, error: "Invalid URL." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false as const, error: "Only http/https URLs are allowed." };
  }

  if (url.username || url.password) {
    return { ok: false as const, error: "Credentials in URL are not allowed." };
  }

  const hostname = url.hostname.toLowerCase();
  if (PRIVATE_HOSTNAMES.has(hostname)) return { ok: false as const, error: "Localhost is blocked." };
  if (hostname.endsWith(".local")) return { ok: false as const, error: "Local network hostnames are blocked." };
  if (isPrivateIpv4Literal(hostname)) return { ok: false as const, error: "Private IPs are blocked." };
  if (hostname.includes(":") && isPrivateIpv6Literal(hostname)) return { ok: false as const, error: "Private IPs are blocked." };

  return { ok: true as const, url };
}

export function toAbsoluteUrl(value: string, base: string) {
  try {
    const u = new URL(value, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}
