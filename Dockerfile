# PayPit runs as ONE long-lived Node process: the trading floor lives in
# memory and is advanced by an in-process timer, so it must not be scaled
# horizontally or run on a serverless platform.

FROM node:20-alpine

WORKDIR /app

# dependency layer first so code edits don't reinstall
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# the demo world is runtime state, never baked into the image
RUN rm -rf data

RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

# next start honours $PORT, so hosts that inject one just work
CMD ["npm", "start"]
