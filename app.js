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

// 项目初始化：自动创建user数据表
const initTable = async()=>{
    const createTableSQL = `
    CREATE TABLE IF NOT EXISTS user(
    id INT PRIMARY KEY AUTO_INCREMENT COMMENT'主键',
    name VARCHAR(50) NOT NULL COMMENT'姓名',
    age TINYINT COMMENT'年龄',
    username VARCHAR(50) UNIQUE COMMENT'用户登录名',
    password VARCHAR(100) COMMENT'密码（bcrypt加密）',
    role VARCHAR(20) DEFAULT  'user' COMMENT '角色：admin/user',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
    )ENGINE=InnoDB DEFAULT CHARSET = utf8mb4;
       `;
       await pool.query(createTableSQL);

       const adminExists = await pool.query('SELECT id FROM user WHERE username = ?',['admin']);
       if(adminExists[0].length===0){
        const adminPwd = bcrypt.hashSync('123456',10);
        await pool.query('INSERT INTO user(name,age,username,password,role) VALUES(?,?,?,?,?)',
            ['管理员',30,'admin',adminPwd,'admin']);
       }
       const userExists = await pool.query('SELECT id FROM user WHERE username = ?',['user']);
       if(userExists[0].length===0){
        const userPwd = bcrypt.hashSync('123456',10);
        await pool.query('INSERT INTO user(name,age,username,password,role) VALUES(?,?,?,?,?)',
            ['普通用户',25,'user',userPwd,'user']);
       }
       console.log('数据表初始化完成，user表已就绪')
};
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

    const [rows] = await pool.query('SELECT * FROM user WHERE username = ?',[username]);
    if(rows.length==0){
        return res.send({code:400,msg:'账号和密码错误'})
    }

    const user = rows[0];
    const match = bcrypt.compareSync(password,user.password);
    if(!match){
        return res.send({code:400,msg:'账号和密码错误'})
    }

    const token = jwt.sign(
        {id:user.id,username:user.username,role:user.role},
        process.env.JWT_SECRET,
        {expiresIn:process.env.JWT_EXPIRES_IN}
    )
    res.send({
        code:200,
        msg:'登录成功',
        data:{token,username:user.username,role:user.role}
    })
}))

//鉴权中间件
const authMiddleware = (req,res,next) =>{
    const token =  req.headers.authorization?.split(' ')[1]

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
//管理员权限中间件
const requireAdmin = (req,res,next) =>{
    if(req.user?.role !=='admin'){
        return res.status(403).send({code:403,msg:'无权限操作，仅管理员可执行'})
    }
    next()
}


// 1. 测试接口：GET 请求，前端访问就能验证通不通
app.get('/api/test',(req ,res) =>{
    res.send({code:200,msg:'前后端连接成功',data:null})
})
// 2. 查询用户列表接口（分页）
app.get('/api/user/list',authMiddleware,asyncHandler(async(req ,res)=>{
    const page = parseInt(req.query.page) ||1
    const pageSize = parseInt(req.query.pageSize)||10
    //计算跳过的条数
    const offset = (page-1) *pageSize
    //两条sql：先查总数（供前端分页器显示），再查当前页数据
    const [[{total}]] = await pool.query('SELECT COUNT(*) AS total FROM user')
    const[row]=await pool.query('SELECT id, name, age, DATE_FORMAT(create_time, "%Y-%m-%d %H:%i:%s") AS create_time FROM user LIMIT ? OFFSET ?',[pageSize, offset]);
    res.send({code:200,msg:'查询成功',data:{list:row,total}})
}))

// 2.1 按ID查询单个用户接口
app.get('/api/user/detail/:id',authMiddleware,asyncHandler(async(req,res)=>{
    const id = req.params.id;
    if(!id) return res.send({code:400,msg:'id不能为空'});

    const [row] = await pool.query('SELECT id, name, age, DATE_FORMAT(create_time, "%Y-%m-%d %H:%i:%s") AS create_time FROM user WHERE id=?', [id]);
    if(row.length === 0){
        return res.send({code:404,msg:'用户不存在'});
    }
    res.send({code:200,msg:'查询成功',data:row[0]})
}))

// 3. 新增用户
app.post('/api/user/add',authMiddleware,requireAdmin,asyncHandler(async (req ,res)=>{
    const{name,age}= req.body;
    if(!name) return res.send({code:400,msg:'姓名不能为空'});
        const [row] = await pool.query('INSERT INTO user(name,age) VALUES (?,?)',[name,age]);
        res.send({code:200,msg:'新增成功',insertId:row.insertId});
}));
// 4. 修改用户
app.put('/api/user/update',authMiddleware,requireAdmin,asyncHandler(async(req,res)=>{
    const{id,name,age} = req.body;
    if(!id) return res.send({code:400,msg:'id不能为空'});
    if(!name) return res.send({code:400,msg:'姓名不能为空'});
   
        await pool.query('UPDATE user SET name=?,age=? WHERE id=?',[name,age,id]);
        res.send({code:200,msg:'修改成功'});  
}));
// 5. 删除用户
app.delete('/api/user/del/:id',authMiddleware,requireAdmin,asyncHandler(async(req,res)=>{
    const id = req.params.id;
    if(!id) return res.send({code:400,msg:'id不能为空'});
        await pool.query('DELETE FROM user WHERE id=?',[id]);
        res.send({code:200,msg:'删除成功'});   
}));
//6.注册用户
app.post('/api/register',asyncHandler(async(req,res)=>{
    const {username,password,name,age} = req.body
    if(!username || !password){
        return res.send({code:400,msg:'用户名和密码不能为空'})
    }
    //验证用户名是否已存在
    const [exists] = await pool.query('SELECT id FROM user WHERE username = ?',[username])
    if(exists.length > 0){
        return res.send({code:400,msg:'用户名已存在'})
    }
    // 密码加密后存入，默认角色 user
    const hashPwd = bcrypt.hashSync(password,10)
    await pool.query('INSERT INTO user(name,age,username,password,role) VALUES(?,?,?,?,?)',
        [name||username,age||null,username,hashPwd,'user'])
        res.send({code:200,msg:'注册成功'})
}))
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