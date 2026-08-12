FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs registry.snapshot.json playbooks.snapshot.json recommendations.snapshot.json pulse.snapshot.json ./
USER node
CMD ["node", "server.mjs"]
