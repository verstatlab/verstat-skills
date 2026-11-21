const env = process.env;

const config = {
  chargeRetries: Number(env.CHARGE_RETRIES || 3),
  invoiceCacheTtl: Number(env.INVOICE_CACHE_TTL || 300),
  gatewayTimeoutMs: Number(env.GATEWAY_TIMEOUT_MS || 5000),
  currency: env.BILLING_CURRENCY || 'UAH',
};

module.exports = { config };
