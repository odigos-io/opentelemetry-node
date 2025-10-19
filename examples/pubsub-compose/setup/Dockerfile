FROM node:20-alpine
WORKDIR /app

# Copy shared deps manifest and install
COPY examples/pubsub-compose/shared/package.json ./package.json
RUN npm install --omit=dev

# Copy minimal repo pieces needed at runtime
COPY examples/pubsub-compose/shared/otel.cjs ./shared/otel.cjs
COPY examples/pubsub-compose/setup/index.js ./index.js
COPY src/instrumentations ./src/instrumentations
COPY src/version.ts ./src/version.ts

ENV NODE_OPTIONS="--enable-source-maps"
ENV TS_NODE_COMPILER_OPTIONS='{"module":"NodeNext","moduleResolution":"NodeNext"}'
CMD ["node", "-r", "./shared/otel.cjs", "index.js"]

