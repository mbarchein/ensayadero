// Generates the anon and service_role API keys (HS256 JWTs) for a given
// JWT_SECRET. They must be signed with the SAME secret the stack uses.
//   node docker/gen-keys.mjs "<JWT_SECRET>"
// or, without a local node:
//   docker run --rm -v "$PWD/docker:/d" node:22-alpine node /d/gen-keys.mjs "<JWT_SECRET>"
import { createHmac } from 'node:crypto'

const secret = process.argv[2] || process.env.JWT_SECRET
if (!secret || secret.length < 32) {
  console.error('usage: node gen-keys.mjs <JWT_SECRET>   (min 32 chars)')
  process.exit(1)
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const iat = Math.floor(Date.now() / 1000)
const exp = iat + 10 * 365 * 24 * 3600 // ~10 years
const header = b64({ alg: 'HS256', typ: 'JWT' })

const sign = (role) => {
  const payload = b64({ role, iss: 'ensayadero', iat, exp })
  const data = `${header}.${payload}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

console.log('ANON_KEY=' + sign('anon'))
console.log('SERVICE_ROLE_KEY=' + sign('service_role'))
