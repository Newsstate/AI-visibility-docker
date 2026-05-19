FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install --production
COPY src ./src
EXPOSE 4000
CMD ["sh", "-c", "node src/db/migrate.js && node src/index.js"]
