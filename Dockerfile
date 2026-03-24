FROM node:20-alpine

# Install build tools for native dependencies (like better-sqlite3)
RUN apk add --no-cache python3 make g++ 

WORKDIR /app

# Install dependencies first for caching
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
