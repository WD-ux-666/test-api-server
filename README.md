# test-api-server 用户管理后端接口

## 项目简介
基于 Node.js + Express + MySQL2 开发的 RESTful 接口服务，为 Vue 前端管理系统提供用户 CRUD 接口与 JWT 登录鉴权。

## 技术栈
- 运行环境：Node.js
- Web 框架：Express
- 数据库：MySQL（mysql2 异步连接池）
- 鉴权：JWT（jsonwebtoken）
- 跨域处理：cors
- 环境配置：dotenv

## 功能亮点
1. 服务启动自动创建 user 用户数据表，无需手动建表；
2. 统一接口返回格式，区分成功/失败状态码；
3. 完整用户管理接口：新增、查询（列表/单查）、修改、删除；
4. 参数合法性校验，捕获数据库异常并返回错误信息；
5. 使用连接池优化 MySQL 数据库连接性能；
6. JWT 登录鉴权，用户管理接口需携带 Token 访问；
7. 列表接口支持分页（page / pageSize 参数），数据量大时避免全表传输。

## 数据库说明
数据表 `user` 字段：
- id：主键自增
- name：用户姓名（非空）
- age：用户年龄
- create_time：数据创建时间（默认当前时间）

## 全部接口列表
| 请求方式 | 接口地址 | 功能说明 | 是否需要登录 |
| ---- | ---- | ---- | ---- |
| POST | /api/login | 登录，返回 JWT Token | 否 |
| GET | /api/test | 前后端连通测试 | 否 |
| GET | /api/user/list?page=1&pageSize=10 | 分页查询用户列表 | 是 |
| GET | /api/user/detail/:id | 按ID查询单个用户 | 是 |
| POST | /api/user/add | 新增用户 | 是 |
| PUT | /api/user/update | 修改用户信息 | 是 |
| DELETE | /api/user/del/:id | 根据ID删除用户 | 是 |

> 登录测试账号：admin / 123456

## 项目启动
```bash
# 克隆项目
git clone https://github.com/WD-ux-666/test-api-server.git
cd test-api-server

# 安装依赖
npm install

# 配置环境变量（复制模板并填写数据库信息）
# Windows: copy .env.example .env
# Linux/Mac: cp .env.example .env

# 启动服务
node app.js
```
