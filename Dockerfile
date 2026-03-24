FROM node:20-alpine

WORKDIR /app

# 서버 의존성
COPY server/package*.json ./server/
RUN cd server && npm install

# 클라이언트 의존성 + 빌드
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client/ ./client/
RUN cd client && npm run build

# 서버 빌드
COPY server/ ./server/
RUN cd server && npm run build

# 클라이언트 빌드 → 서버 public 폴더
RUN cp -r client/dist server/dist/public

# SQL 파일 복사 (tsc가 복사 안 하므로)
RUN cp -r server/src/database/*.sql server/dist/database/

EXPOSE 8000
ENV PORT=8000
CMD ["node", "server/dist/index.js"]
