FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run lint && npm test && npm run test:ui && npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/build ./build
COPY --from=build /app/locales ./locales
COPY --from=build /app/firebase-applet-config.json ./firebase-applet-config.json
USER node
EXPOSE 3000
CMD ["node", "build/server.cjs"]
