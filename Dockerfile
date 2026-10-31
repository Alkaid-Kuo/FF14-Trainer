# 絕神兵練習器：自架用的 image（server/node-server.js＋建置好的 server/public/index.html）
FROM docker.io/library/node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/node-server.js ./
COPY server/public ./public
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "node-server.js"]
