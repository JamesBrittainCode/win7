import { lookup } from "node:dns/promises";
import { isBlockedHostname, isPrivateIpv4Literal, isPrivateIpv6Literal } from "./urlSafety";

export async function assertNoPrivateResolution(hostname: string) {
  if (isBlockedHostname(hostname)) {
    throw new Error("Blocked target hostname.");
  }

  // Fast path: literal IP
  if (isPrivateIpv4Literal(hostname) || isPrivateIpv6Literal(hostname)) {
    throw new Error("Blocked private IP target.");
  }

  // DNS lookup (A/AAAA) to reduce SSRF risk via DNS to private ranges.
  // Note: this is still best-effort; DNS rebinding and redirect chains can exist.
  const results = await lookup(hostname, { all: true, verbatim: true });
  for (const r of results) {
    if (isPrivateIpv4Literal(r.address) || isPrivateIpv6Literal(r.address)) {
      throw new Error("Blocked target resolving to private IP.");
    }
  }
}

