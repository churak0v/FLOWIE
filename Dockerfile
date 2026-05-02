FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src

ARG VITE_API_URL
ARG VITE_API_PROXY_TARGET
ARG VITE_HERO_IMAGE
ARG VITE_RECIPIENT_IMAGE
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_PROXY_TARGET=${VITE_API_PROXY_TARGET}
ENV VITE_HERO_IMAGE=${VITE_HERO_IMAGE}
ENV VITE_RECIPIENT_IMAGE=${VITE_RECIPIENT_IMAGE}

RUN npm run build

FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
