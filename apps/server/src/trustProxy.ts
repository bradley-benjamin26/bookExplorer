/**
 * Fastify's `trustProxy` from the TRUST_PROXY env var (see .env.example):
 *   unset / "false"    — trust no proxy; the socket address is the client
 *   "true" or a number — trust that many proxy hops ("true" means 1)
 *   anything else      — a comma-separated list of proxy IPs/CIDRs
 * Plain `true` is never passed through: Fastify would then trust every
 * address in X-Forwarded-For, including ones the client wrote itself.
 */
export function parseTrustProxy(value: string | undefined): boolean | string | ((address: string, hop: number) => boolean) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "false") return false;
  // A hop count, expressed as the trust function Fastify's types accept:
  // hop 0 is the socket peer (the nearest proxy), hop 1 the one before it…
  const hops = trimmed === "true" ? 1 : /^\d+$/.test(trimmed) ? Number(trimmed) : null;
  if (hops !== null) return (_address, hop) => hop < hops;
  return trimmed;
}
