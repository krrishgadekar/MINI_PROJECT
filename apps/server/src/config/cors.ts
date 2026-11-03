/**
 * Parses comma-separated CLIENT_ORIGINS from environment variables,
 * falling back to default localhost origins for local development.
 * Handles the special '*' wildcard to allow all origins.
 */
export const getClientOrigins = (): string[] | string => {
  const origins = process.env.CLIENT_ORIGINS;
  if (!origins) {
    return ['http://localhost:3000', 'http://localhost:4000'];
  }
  // If wildcard, return the string '*' (not an array) for cors middleware
  if (origins.trim() === '*') {
    return '*';
  }
  return origins
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};
