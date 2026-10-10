FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY worker.mjs ./
USER node
EXPOSE 8080
CMD ["node", "worker.mjs"]
