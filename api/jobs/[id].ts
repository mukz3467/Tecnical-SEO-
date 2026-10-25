import app from '../../server/app.ts';

// Explicit Vercel route for retrieving a single audit job. The shared Express
// app owns the handler; this file ensures /api/jobs/:id is routed to a function.
export default app;
