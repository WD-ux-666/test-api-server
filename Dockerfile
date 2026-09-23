# 后端镜像：Node 18 官方 slim 版（体积小，约 200MB）
FROM node:18-slim

WORKDIR /app

# 先只拷 package*.json，利用 Docker 缓存层：依赖不变就不重装
COPY package*.json ./
RUN npm install --production

# 再拷业务代码
COPY . .

# 容器内端口
EXPOSE 3000

# 启动命令
CMD ["node", "app.js"]
