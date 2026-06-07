# Edge function (Deno) baked into an image for Swarm. Build from the repo root:
#   docker build -f docker/functions.Dockerfile -t ensayadero/functions:latest .
FROM denoland/deno:alpine
WORKDIR /functions/send-notifications
COPY supabase/functions/send-notifications/ ./
# Pre-cache dependencies so startup doesn't hit the network
RUN deno cache index.ts || true
CMD ["run", "--allow-net", "--allow-env", "index.ts"]
