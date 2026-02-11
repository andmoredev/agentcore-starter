// API configuration - baseUrl is injected at build time by build-with-api-config.sh
// For local development, update this with your backend API URL

export const API_CONFIG = {
  baseUrl: 'http://localhost:3000/api/',
  endpoints: {
    query: 'query'
  }
} as const;

export default API_CONFIG;
