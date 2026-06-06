# Build estático de la PWA. Producción real = Cloudflare Pages (sin Docker).
# Este Dockerfile sirve para: preview local, CI builds reproducibles,
# y fallback self-host si algún día se abandona free tier.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_APP_URL
ARG VITE_VAPID_PUBLIC_KEY
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
