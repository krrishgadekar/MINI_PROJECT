/**
 * Parses comma-separated CLIENT_ORIGINS from environment variables,
 * falling back to default localhost origins for local development.
 */
export const getClientOrigins = (): string[] => {
  const origins = process.env.CLIENT_ORIGINS;
  if (origins) {
    return origins
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }
  return ['http://localhost:3000', 'http://localhost:4000'];
};
