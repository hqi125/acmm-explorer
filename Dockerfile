FROM node:24-alpine

WORKDIR /workspace

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

EXPOSE 5173

CMD ["sh", "-lc", "npm install --no-audit --no-fund && exec ./node_modules/.bin/vite --host 0.0.0.0"]
