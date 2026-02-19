FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source files
COPY server.js .
COPY config.json .

# Hugging Face Spaces uses port 7860
ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]
