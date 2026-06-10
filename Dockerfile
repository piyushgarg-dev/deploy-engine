FROM node:24-alpine

COPY package.json package.json
COPY package-lock.json package-lock.json

RUN npm install

COPY server.js server.js

CMD ["npm", "start"]