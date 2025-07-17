FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application for production
RUN yarn build

# Install a simple HTTP server to serve the built files
RUN yarn global add serve

# Expose port
EXPOSE 3000

# Serve the built application
CMD ["serve", "-s", "dist/frontend", "-l", "3000"]
