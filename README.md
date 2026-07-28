# test-api-server 用户管理后端接口
## 项目简介
基于 Node.js + Express + MySQL2 开发的RESTful接口服务，为Vue前端管理系统提供用户CRUD接口。

## 技术栈
- 运行环境：Node.js
- Web框架：Express
- 跨域处理：cors
- 数据库：MySQL（mysql2异步连接池）

## 功能亮点
1. 服务启动自动创建user用户数据表，无需手动建表；
2. 统一接口返回格式，区分成功/失败状态码；
3. 完整用户管理接口：新增、查询、修改、删除；
4. 参数合法性校验，捕获数据库异常并返回错误信息；
5. 使用连接池优化MySQL数据库连接性能。

## 数据库说明
数据表 `user` 字段：
- id：主键自增
- name：用户姓名（非空）
- age：用户年龄
- create_time：数据创建时间（默认当前时间）

## 全部接口列表
| 请求方式 | 接口地址 | 功能说明 |
| ---- | ---- | ---- |
| GET | /api/test | 前后端连通测试 |
| GET | /api/user/list | 查询全部用户 |
| POST | /api/user/add | 新增用户 |
| PUT | /api/user/update | 修改用户信息 |
| DELETE | /api/user/del/:id | 根据ID删除用户 |

## 项目启动
```bash
# 克隆项目
git clone https://github.com/WD-ux-666/test-api-server.git
cd test-api-server

# 安装依赖
npm install

# 启动服务
node app.js
