FROM node:20-alpine AS build
WORKDIR /app
COPY apps/mf-portal-vue/package*.json ./
RUN npm install
COPY apps/mf-portal-vue .
RUN npm run build
FROM nginx:1.27-alpine
COPY apps/mf-portal-vue/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
