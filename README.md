# @odigos/opentelemetry-node

This is abranch for the legacy nodejs-community-14 distro, which is using
opentelemetry sdk verison 1.
It supports Node.js >= 14, which some of odigos users are still using.

Since otel stopped supporting node 14 and stopped maintaining the sdk v1 version, this branch is not expected to be updated, and just left as an option for existing users for a migration period.

If it ever needs to be updated, login to ecr and publish a new version:

```
export NEW_VERSION="v0.0.17"
export ECR_REPO_NODEJS_COMMUNITY="public.ecr.aws/odigos/agents/nodejs-community-14"

# Stable release: tag version + latest
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --file Dockerfile \
  --build-arg "AGENT_VERSION=${NEW_VERSION}" \
  --tag "${ECR_REPO_NODEJS_COMMUNITY}:${NEW_VERSION}" \
  --tag "${ECR_REPO_NODEJS_COMMUNITY}:latest" \
  --push \
  .
```

Then push the new git tag on this branch:

```
git tag nodejs-community-14/$NEW_VERSION
git push upstream nodejs-community-14/$NEW_VERSION
```
