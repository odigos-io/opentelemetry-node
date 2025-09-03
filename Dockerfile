FROM node:22 AS nodejs-community-build
ARG AGENT_VERSION
WORKDIR /opentelemetry-node
COPY package.json yarn.lock .
RUN yarn install --frozen-lockfile
COPY . .
RUN echo "export const VERSION = \"$AGENT_VERSION\";" > ./src/version.ts
RUN yarn compile

# this build step is only for the production node_modules.
# the "--production" for yarn install allows us to minimize the agent node_modules,
# by not pulling in dev dependencies like typescript.
FROM node:22 AS nodejs-prod-modules
WORKDIR /opentelemetry-node-prod
COPY package.json yarn.lock .
RUN yarn install --frozen-lockfile --production

# Ultra-minimal base image - just for copying files
FROM scratch
WORKDIR /instrumentations

COPY --from=nodejs-community-build /opentelemetry-node/package.json ./opentelemetry-node/package.json
COPY --from=nodejs-community-build /opentelemetry-node/LICENSE ./opentelemetry-node/LICENSE
COPY --from=nodejs-community-build /opentelemetry-node/build ./opentelemetry-node/build
COPY --from=nodejs-prod-modules /opentelemetry-node-prod/node_modules ./opentelemetry-node/node_modules
COPY --from=nodejs-community-build /opentelemetry-node/build/src/nodejs-community/autoinstrumentation.js ./nodejs-community/autoinstrumentation.js
