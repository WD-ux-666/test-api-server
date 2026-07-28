const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const app = express();
const port = 3000;


// 全局中间件（面试考点：两个核心中间件）
app.use(cors());
app.use(express.json());

// 创建mysql连接池
const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    password: '******',
    database: 'test_db',
});

// 项目初始化：自动创建user数据表
const initTable = async()=>{
    const createTableSQL = `
    CREATE TABLE IF NOT EXISTS user(
       id INT PRIMARY KEY AUTO_INCREMENT COMMENT'主键',
       name VARCHAR(50) NOT NULL COMMENT'姓名',
       age TINYINT COMMENT'年龄',
       create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
        )ENGINE=InnoDB DEFAULT CHARSET = utf8mb4;
       `;
       await pool.query(createTableSQL);
       console.log('数据表初始化完成，user表已就绪')
};

// 1. 测试接口：GET 请求，前端访问就能验证通不通
app.get('/api/test',(req ,res) =>{
    res.send({code:200,msg:'前后端连接成功',data:null})
})
// 2. 查询数据表所有数据接口
app.get('/api/user/list',async(req ,res)=>{
    try{
        const[row]=await pool.query('SELECT * FROM user');
        res.send({code:200,msg:'查询成功',data:row})
    }catch(err){
        res.send({code:500,msg:'查询失败',error:err.message})
    }
})

// 3. 新增用户
app.post('/api/user/add',async (req ,res)=>{
    const{name,age}= req.body;
    if(!name) return res.send({code:400,msg:'姓名不能为空'});
    try{
        const [row] = await pool.query('INSERT INTO user(name,age) VALUES (?,?)',[name,age]);
        res.send({code:200,msg:'新增成功',insertId:row.insertId});
    }catch(err){
        res.send({code:500,msg:'新增失败',error:err.message}); 
    }
});
// 4. 修改用户
app.put('/api/user/update',async(req,res)=>{
    const{id,name,age} = req.body;
    if(!id) return res.send({code:400,msg:'id不能为空'});
    if(!name) return res.send({code:400,msg:'姓名不能为空'});
    try{
        await pool.query('UPDATE user SET name=?,age=? WHERE id=?',[name,age,id]);
        res.send({code:200,msg:'修改成功'});
    }catch(err){
        res.send({code:500,msg:'修改失败',error:err.message}); 
    }
});
// 5. 删除用户
app.delete('/api/user/del/:id',async(req,res)=>{
    const id = req.params.id;
    if(!id) return res.send({code:400,msg:'id不能为空'});
    try{
        await pool.query('DELETE FROM user WHERE id=?',[id]);
        res.send({code:200,msg:'删除成功'});
    }catch(err){
        res.send({code:500,msg:'删除失败',error:err.message});
    }
});
initTable().then(()=>{
    app.listen(port,()=>{
        console.log(`后端服务运行地址：http://localhost:${port}`);  
    });
}).catch(err=>{
    console.log('数据表初始化失败',err);
});