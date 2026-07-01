# Quarantined Next API Routes

The patient app runtime now treats API Gateway/Lambda as the production owner of
`/api/*` routes. Files under this directory are retained only as a temporary
local-development compatibility layer for `npm run dev` and the Vite proxy.

Do not add new patient API behavior here. Add or change production behavior in
`infra/src/lambda/*`, wire it in `infra/src/serverless-platform-stack.ts`, and
cover it with Lambda or route parity tests. Once local development has a Lambda
runner or API Gateway emulator, this directory should be removed.
