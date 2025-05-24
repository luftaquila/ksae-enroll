FROM node:22-alpine

WORKDIR /home/node/ksae-enroll
COPY package*.json ./
COPY web/package*.json web/

RUN npm ci
RUN npm --prefix web ci
COPY . .

EXPOSE 8000
CMD [ "node", "index.mjs" ]
