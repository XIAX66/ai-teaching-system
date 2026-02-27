# Build Stage
FROM node:23-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Production Stage
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom Nginx config to handle React Router (SPA)
RUN echo 'server { 
    listen 80; 
    location / { 
        root /usr/share/nginx/html; 
        index index.html index.htm; 
        try_files $uri $uri/ /index.html; 
    } 
    location /api/ { 
        proxy_pass http://backend:8080; 
        proxy_http_version 1.1; 
        proxy_set_header Upgrade $http_upgrade; 
        proxy_set_header Connection "upgrade"; 
        proxy_set_header Host $host; 
        proxy_cache_bypass $http_upgrade; 
    } 
    location /uploads/ { 
        proxy_pass http://backend:8080/uploads/; 
    } 
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
