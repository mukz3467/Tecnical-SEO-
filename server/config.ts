import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  isProd: process.env.NODE_ENV === 'production',
  disableHmr: process.env.DISABLE_HMR === 'true',
};

export function getRequiredEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}
