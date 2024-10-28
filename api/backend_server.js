// Backend server using Node.js and Express with SQLite
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cors = require('cors');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// SQLite database connection
const db = new sqlite3.Database('./game_db.sqlite', (err) => {
    if (err) {
        console.error('Error connecting to SQLite:', err);
        return;
    }
    console.log('Connected to SQLite');
});

// Create users and scores tables if they do not exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        score INTEGER
    )`);
});

// Register endpoint
app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ success: false, message: '用户名和密码不能为空' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);

    const query = 'INSERT INTO users (username, password) VALUES (?, ?)';
    db.run(query, [username, hashedPassword], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.json({ success: false, message: '用户名已存在' });
            }
            return res.json({ success: false, message: '注册失败' });
        }
        res.json({ success: true, message: '注册成功' });
    });
});

// Login endpoint
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.json({ success: false, message: '用户名和密码不能为空' });
    }

    const query = 'SELECT * FROM users WHERE username = ?';
    db.get(query, [username], (err, user) => {
        if (err) {
            return res.json({ success: false, message: '登录失败' });
        }
        if (!user) {
            return res.json({ success: false, message: '用户不存在' });
        }

        if (!bcrypt.compareSync(password, user.password)) {
            return res.json({ success: false, message: '密码错误' });
        }

        res.json({ success: true, user: { id: user.id, username: user.username } });
    });
});

// Submit score endpoint (updates user's high score)
app.post('/api/score', (req, res) => {
    const { username, score } = req.body;
    if (!username || typeof score !== 'number') {
        return res.json({ success: false, message: '用户名和分数无效' });
    }

    // 首先检查是否存在记录
    db.get('SELECT score FROM scores WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error('数据库查询错误:', err);
            return res.json({ success: false, message: '分数更新失败' });
        }

        if (!row) {
            // 如果不存在记录，插入新记录
            db.run('INSERT INTO scores (username, score) VALUES (?, ?)', 
                [username, score], 
                function(err) {
                    if (err) {
                        console.error('数据库插入错误:', err);
                        return res.json({ success: false, message: '分数更新失败' });
                    }
                    console.log(`用户 ${username} 创建了新记录: ${score}`);
                    res.json({ 
                        success: true, 
                        message: '最高分已更新',
                        highScore: score
                    });
                }
            );
        } else {
            // 如果存在记录且新分数更高，更新记录
            if (score > row.score) {
                db.run('UPDATE scores SET score = ? WHERE username = ?', 
                    [score, username], 
                    function(err) {
                        if (err) {
                            console.error('数据库更新错误:', err);
                            return res.json({ success: false, message: '分数更新失败' });
                        }
                        console.log(`用户 ${username} 更新了最高分: ${score}`);
                        res.json({ 
                            success: true, 
                            message: '最高分已更新',
                            highScore: score
                        });
                    }
                );
            } else {
                // 如果新分数不是最高分，返回当前最高分
                res.json({ 
                    success: true, 
                    message: '当前分数未超过最高分',
                    highScore: row.score
                });
            }
        }
    });
});

// Get top 10 scores (Leaderboard endpoint)
app.get('/api/leaderboard', (req, res) => {
    const query = 'SELECT username, MAX(score) as highScore FROM scores GROUP BY username ORDER BY highScore DESC LIMIT 10';
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.json({ success: false, message: '无法获取排行榜' });
        }
        res.json({ success: true, scores: rows });
    });
});

// Get user's high score endpoint
app.get('/api/highscore', (req, res) => {
    const { username } = req.query;  // 修改参数名以匹配前端
    if (!username) {
        return res.json({ success: false, message: '用户名不能为空' });
    }

    const query = 'SELECT MAX(score) as highScore FROM scores WHERE username = ?';
    db.get(query, [username], (err, row) => {
        if (err) {
            return res.json({ success: false, message: '无法获取最高分' });
        }
        res.json({ success: true, highScore: row?.highScore || 0 });
    });
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
