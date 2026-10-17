FROM node:20-alpine AS build
WORKDIR /app
COPY apps/mf-bi-angular/package*.json ./
RUN npm install
COPY apps/mf-bi-angular .
RUN npm run build
FROM nginx:1.27-alpine
COPY apps/mf-bi-angular/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/mf-bi-angular/browser /usr/share/nginx/html
EXPOSE 80
