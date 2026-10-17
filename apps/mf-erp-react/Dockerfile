FROM node:20-alpine AS build
WORKDIR /app
COPY apps/mf-erp-react/package*.json ./
RUN npm install
COPY apps/mf-erp-react .
RUN npm run build
FROM nginx:1.27-alpine
COPY apps/mf-erp-react/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
