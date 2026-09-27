FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --registry=https://registry.npmmirror.com
COPY dist ./dist
COPY foods.json ./
COPY server ./server
ENV PORT=8899 NODE_ENV=production
EXPOSE 8899
VOLUME ["/app/data"]
CMD ["node", "server/index.mjs"]
