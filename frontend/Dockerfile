FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8081

ENV CI=1
CMD ["npx", "expo", "start", "--web", "--port", "8081"]
