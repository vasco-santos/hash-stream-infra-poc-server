# Use Node.js base image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of your code
COPY . .

# Expose the server port (adjust if needed)
EXPOSE 3000

# Start the app (adjust this to your actual start script if changed)
CMD ["node", "src/index.js"]