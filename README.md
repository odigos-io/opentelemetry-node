# @odigos/opentelemetry-node

Odigos distribution of OpenTelemetry for Node.js

This package is used in the odigos project to provide auto OpenTelemetry instrumentation for applications written in Node.js.

Note: This package is currently meant to be used in the odigos project with odigos OpAMP server. It cannot be used as a standalone package in arbitrary Node.js applications.

# Local Development

To test changes when working with odigos k8s, you have 2 options:

## Rebuild Odiglet Image

The agent files are bundled into the odiglet image, and are updated on the node whenever the agent is built and odiglet restarts.

- In odigos repo, check the version of `COPY --from=public.ecr.aws/odigos/agents/nodejs-community` entry in the odiglet Dockerfile.
- Build the nodejs-community image with the new version: `docker build -t odigos/nodejs-community:<version> -f Dockerfile .`
- Build and deploy odiglet image with the new nodejs-community image: in odigos repo, run `make deploy-odiglet`
- Wait for odiglet to fully restart and be ready.
- Restart the node pods in the odigos k8s cluster.

## Build Agent to Local Directory (No odiglet build or deployment required)

Use a mount from the local development kind cluster to the local fs. then every write to this directory will be reflected in the k8s cluster and take effect on next nodejs instrumented application restart.

- create kind cluster with mount: `yarn create-cluster`
- install odigos into this cluster (with helm, cli, local chart, or any method you prefer)
- build the agent to the local directory: `yarn build-to-varodigos`
- restart the node pods in the odigos k8s cluster.
