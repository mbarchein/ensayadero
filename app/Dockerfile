# Static PWA build served by nginx. Used for the local preview, CI builds,
# and the self-hosted Swarm production image (see DEPLOY.md). The VITE_* args
# are baked in at build time.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_APP_URL
ARG VITE_VAPID_PUBLIC_KEY
ARG VITE_TURNSTILE_SITE_KEY
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
