require('dotenv').config()
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs')
const app = express();
const port = process.env.PORT || 3000;


// 全局中间件（面试考点：两个核心中间件）
app.use(cors());
app.use(express.json());

// 创建mysql连接池
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// 项目初始化：自动创建 role 表 + user 表，并做存量迁移
const initTable = async() =>{
    // 1. 角色表（必须先建，user 表迁移时要引用它）
    await pool.query(`
        CREATE TABLE IF NOT EXISTS role(
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '角色ID',
        role_key VARCHAR(20) NOT NULL UNIQUE COMMENT '角色标识',
        role_name VARCHAR(50) NOT NULL COMMENT '角色名称',
        menus JSON COMMENT '可见菜单key列表',
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
        )ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // 2. 角色种子数据（幂等：有数据就跳过）
    const [[{roleCount}]] = await pool.query('SELECT COUNT(*) AS roleCount FROM role');
    if(roleCount === 0){
        await pool.query(`INSERT INTO role(role_key,role_name,menus) VALUES
            ('admin','管理员',JSON_ARRAY('user','role')),
            ('user','普通用户',JSON_ARRAY('user'))`);
    }

    // 3. user 表（新环境直接建新结构）
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user(
        id INT PRIMARY KEY AUTO_INCREMENT COMMENT '主键',
        name VARCHAR(50) NOT NULL COMMENT '姓名',
        age TINYINT COMMENT '年龄',
        username VARCHAR(50) UNIQUE COMMENT '用户登录名',
        password VARCHAR(100) COMMENT '密码（bcrypt加密）',
        role_id INT COMMENT '角色ID，关联role表',
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
        )ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // 4. 存量库迁移：老表是 role 字符串列，迁到 role_id 后删旧列
    const [cols] = await pool.query("SHOW COLUMNS FROM user LIKE 'role_id'");
    if(cols.length === 0){
        await pool.query('ALTER TABLE user ADD COLUMN role_id INT');
        await pool.query('UPDATE user u JOIN role r ON r.role_key = u.role SET u.role_id = r.id');
        await pool.query('ALTER TABLE user DROP COLUMN role');
        console.log('user表已迁移：role字符串列 -> role_id');
    }

    // 5. 种子账号（role_id 写死 1/2，对应上面种子角色的自增id）
    const [adminExists] = await pool.query('SELECT id FROM user WHERE username = ?',['admin']);
    if(adminExists.length === 0){
        const adminPwd = bcrypt.hashSync('123456',10);
        await pool.query('INSERT INTO user(name,age,username,password,role_id) VALUES(?,?,?,?,1)',
            ['管理员',30,'admin',adminPwd]);
    }
    const [userExists] = await pool.query('SELECT id FROM user WHERE username = ?',['user']);
    if(userExists.length === 0){
        const userPwd = bcrypt.hashSync('123456',10);
        await pool.query('INSERT INTO user(name,age,username,password,role_id) VALUES(?,?,?,?,2)',
            ['普通用户',25,'user',userPwd]);
    }
    console.log('数据表初始化完成：user表 + role表 已就绪');
}

//加一个函数，自动捕获async函数中的错误
const asyncHandler = (fn) =>(req,res,next) =>{
    Promise.resolve(fn(req,res,next)).catch(next)
}

const jwt = require('jsonwebtoken')

app.post('/api/login',asyncHandler(async(req,res)=>{
    const {username,password} = req.body

    if (!username || !password){
        return res.send({code:400,msg:'用户名和密码不能为空'})
    }

    const [rows] = await pool.query(`
        SELECT u.*, r.role_key, r.role_name, r.menus
        FROM user u LEFT JOIN role r ON r.id = u.role_id
        WHERE u.username = ?`,[username]);
    if(rows.length === 0){
        return res.send({code:400,msg:'账号和密码错误'})
    }

    const user = rows[0];
    const match = bcrypt.compareSync(password,user.password);
    if(!match){
        return res.send({code:400,msg:'账号和密码错误'})
    }

    const token = jwt.sign(
        {id:user.id,username:user.username,roleId:user.role_id,roleKey:user.role_key},
        process.env.JWT_SECRET,
        {expiresIn:process.env.JWT_EXPIRES_IN}
    )
    res.send({
        code:200,
        msg:'登录成功',
        data:{token,username:user.username,roleKey:user.role_key,roleName:user.role_name,menus:user.menus}
    })
}))

//鉴权中间件
const authMiddleware = (req,res,next) =>{
    let token = null
    if (req.headers.authorization) {
        token = req.headers.authorization.split(' ')[1]
    }

    if(!token){
        return res.status(401).send({code:401,msg:'请登录'})
    }

    try{
        const decoded = jwt.verify(token,process.env.JWT_SECRET)
        req.user = decoded
        next()
    }catch(err){
        return res.status(401).send({code:401,msg:'登录过期，请重新登录'})
    }
}

//管理员权限中间件：用于用户增删改（管理员才能管用户）
const requireAdmin = (req,res,next) =>{
    if(req.user?.roleKey !== 'admin'){
        return res.status(403).send({code:403,msg:'无权限操作，仅管理员可执行'})
    }
    next()
}

//通用权限中间件：按菜单key校验，用于角色管理接口
const requirePerm = (perm) =>
    asyncHandler(async(req,res,next) => {
        const [rows] = await pool.query('SELECT menus FROM role WHERE id = ?',[req.user.roleId]);
        const menus = rows[0]?.menus || [];
        if(!menus.includes(perm)){
            return res.status(403).send({code:403,msg:'无权限操作，请联系管理员'})
        }
        next()
    })


// 1. 测试接口：GET 请求，前端访问就能验证通不通
app.get('/api/test',(req ,res) =>{
    res.send({code:200,msg:'前后端连接成功',data:null})
})

// 2. 查询用户列表接口（分页，JOIN 出角色名）
app.get('/api/user/list',authMiddleware,asyncHandler(async(req ,res)=>{
    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.pageSize) || 10
    const offset = (page - 1) * pageSize
    const [[{total}]] = await pool.query('SELECT COUNT(*) AS total FROM user')
    const [row] = await pool.query(`
        SELECT u.id, u.name, u.age, u.role_id, r.role_name,
               DATE_FORMAT(u.create_time, '%Y-%m-%d %H:%i:%s') AS create_time
        FROM user u LEFT JOIN role r ON r.id = u.role_id
        LIMIT ? OFFSET ?`,[pageSize, offset]);
    res.send({code:200,msg:'查询成功',data:{list:row,total}})
}))

// 2.1 按ID查询单个用户接口（编辑弹窗回显用，需要带 role_id）
app.get('/api/user/detail/:id',authMiddleware,asyncHandler(async(req,res)=>{
    const id = req.params.id;
    if(!id) return res.send({code:400,msg:'id不能为空'});

    const [row] = await pool.query(`
        SELECT id, name, age, role_id,
               DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS create_time
        FROM user WHERE id=?`, [id]);
    if(row.length === 0){
        return res.send({code:404,msg:'用户不存在'});
    }
    res.send({code:200,msg:'查询成功',data:row[0]})
}))

// 3. 新增用户（仅管理员）
app.post('/api/user/add',authMiddleware,requireAdmin,asyncHandler(async (req ,res)=>{
    const {name,age,roleId} = req.body;
    if(!name) return res.send({code:400,msg:'姓名不能为空'});
    const [row] = await pool.query('INSERT INTO user(name,age,role_id) VALUES (?,?,?)',
        [name,age,roleId || 2]);
    res.send({code:200,msg:'新增成功',insertId:row.insertId});
}));

// 4. 修改用户（仅管理员）
app.put('/api/user/update',authMiddleware,requireAdmin,asyncHandler(async(req,res)=>{
    const {id,name,age,roleId} = req.body;
    if(!id) return res.send({code:400,msg:'id不能为空'});
    if(!name) return res.send({code:400,msg:'姓名不能为空'});
    await pool.query('UPDATE user SET name=?,age=?,role_id=? WHERE id=?',
        [name,age,roleId || 2,id]);
    res.send({code:200,msg:'修改成功'});
}));

// 5. 删除用户（仅管理员，注意是删 user 不是 role）
app.delete('/api/user/del/:id',authMiddleware,requireAdmin,asyncHandler(async(req,res)=>{
    const id = req.params.id;
    if(!id) return res.send({code:400,msg:'id不能为空'});
    await pool.query('DELETE FROM user WHERE id=?',[id]);
    res.send({code:200,msg:'删除成功'});
}));

// 6. 注册用户（公开接口，默认普通用户角色）
app.post('/api/register',asyncHandler(async(req,res)=>{
    const {username,password,name,age} = req.body
    if(!username || !password){
        return res.send({code:400,msg:'用户名和密码不能为空'})
    }
    const [exists] = await pool.query('SELECT id FROM user WHERE username = ?',[username])
    if(exists.length > 0){
        return res.send({code:400,msg:'用户名已存在'})
    }
    const hashPwd = bcrypt.hashSync(password,10)
    await pool.query('INSERT INTO user(name,age,username,password,role_id) VALUES(?,?,?,?,2)',
        [name||username,age||null,username,hashPwd])
    res.send({code:200,msg:'注册成功'})
}))

// ========== 角色管理接口（RBAC 核心） ==========

// 7. 角色列表（登录即可查，前端动态渲染侧边栏用）
app.get('/api/role/list',authMiddleware,asyncHandler(async(req,res)=>{
    const [rows] = await pool.query('SELECT id, role_key, role_name, menus FROM role ORDER BY id');
    res.send({code:200,msg:'查询成功',data:rows});
}));

// 8. 新增角色（需 role 权限）
app.post('/api/role/add',authMiddleware,requirePerm('role'),asyncHandler(async(req,res)=>{
    const {roleKey,roleName,menus} = req.body;
    if(!roleKey || !roleName) return res.send({code:400,msg:'角色标识和角色名称不能为空'});
    const [exists] = await pool.query('SELECT id FROM role WHERE role_key=?',[roleKey]);
    if(exists.length > 0) return res.send({code:400,msg:'角色标识已存在'});
    const [row] = await pool.query('INSERT INTO role(role_key,role_name,menus) VALUES(?,?,?)',
        [roleKey,roleName,JSON.stringify(menus || [])]);
    res.send({code:200,msg:'新增成功',insertId:row.insertId});
}));

// 9. 修改角色（role_key 不允许改）
app.put('/api/role/update',authMiddleware,requirePerm('role'),asyncHandler(async(req,res)=>{
    const {id,roleName,menus} = req.body;
    if(!id) return res.send({code:400,msg:'id不能为空'});
    if(!roleName) return res.send({code:400,msg:'角色名称不能为空'});
    await pool.query('UPDATE role SET role_name=?, menus=? WHERE id=?',
        [roleName,JSON.stringify(menus || []),id]);
    res.send({code:200,msg:'修改成功'});
}));

// 10. 删除角色（有用户占用时拒绝，引用完整性保护）
app.delete('/api/role/del/:id',authMiddleware,requirePerm('role'),asyncHandler(async(req,res)=>{
    const id = req.params.id;
    if(!id) return res.send({code:400,msg:'id不能为空'});
    const [[{cnt}]] = await pool.query('SELECT COUNT(*) AS cnt FROM user WHERE role_id=?',[id]);
    if(cnt > 0) return res.send({code:400,msg:`该角色下还有 ${cnt} 个用户，不能删除`});
    await pool.query('DELETE FROM role WHERE id=?',[id]);
    res.send({code:200,msg:'删除成功'});
}));

app.use((err,req,res,next)=>{
    res.status(500).send({code:500,msg:'服务器错误',error:err.message});
});

initTable().then(()=>{
    app.listen(port,()=>{
        console.log(`后端服务运行地址：http://localhost:${port}`);
    });
}).catch(err=>{
    console.log('数据表初始化失败',err);
});
