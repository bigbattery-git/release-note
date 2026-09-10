FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY app ./app
COPY lib ./lib
COPY scripts ./scripts
COPY tsconfig.json postcss.config.json next.config.ts ./
EXPOSE 3000
CMD ["npm", "run", "dev"]
