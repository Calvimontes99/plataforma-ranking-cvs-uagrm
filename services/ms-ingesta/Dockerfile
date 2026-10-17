FROM node:20-alpine AS build
WORKDIR /workspace
COPY services/ms-ingesta/package*.json ./services/ms-ingesta/
WORKDIR /workspace/services/ms-ingesta
RUN npm ci
COPY services/ms-ingesta/ .
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /workspace/services/ms-ingesta/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /workspace/services/ms-ingesta/dist ./dist
COPY proto /proto
ENV PROTO_PATH=/proto/recruitment.proto
USER node
EXPOSE 3000 9091
CMD ["node", "dist/main.js"]
