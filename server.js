const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Thiếu DATABASE_URL. Hãy tạo PostgreSQL và thêm biến môi trường DATABASE_URL trên Render.');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });

async function query(text, params=[]) { return pool.query(text, params); }
async function initDb() {
  await query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    salt TEXT NOT NULL, display_name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at BIGINT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, nick TEXT NOT NULL, emoji TEXT NOT NULL,
    role TEXT NOT NULL, bio TEXT NOT NULL, birthday TEXT NOT NULL, hobby TEXT NOT NULL, tags TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS memories (id SERIAL PRIMARY KEY, icon TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS timeline (id SERIAL PRIMARY KEY, year TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL);
  `);

  const mc = await query('SELECT COUNT(*)::int AS c FROM members');
  if (!mc.rows[0].c) {
    const rows = [
      ['Hội','Kính','😎','Người giữ vibe','Luôn xuất hiện với phong thái riêng và chiếc kính quen thuộc.','12/03','Âm nhạc • Đi chơi','Vui tính,Kính,Team chill'],
      ['Phú','Đội trưởng','🧢','Captain của nhóm','Người thường xuyên khởi xướng những cuộc vui bất ngờ.','25/06','Game • Ăn uống','Leader,Năng động,Meme'],
      ['Sương','Bá khí','👑','Nữ hoàng quyền lực','Bá khí hết sức có thể nhưng vẫn rất tình cảm với hội bạn.','09/09','Ảnh • Du lịch','Bá khí,Queen,Cute'],
      ['Phấn','Aura Farming','✨','Chuyên gia tạo aura','Không cần nói nhiều, xuất hiện là đủ thu hút ánh nhìn.','18/11','Anime • Chụp ảnh','Aura,Anime,Cool']
    ];
    for (const r of rows) await query('INSERT INTO members(name,nick,emoji,role,bio,birthday,hobby,tags) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', r);
  }
  const mem = await query('SELECT COUNT(*)::int AS c FROM memories');
  if (!mem.rows[0].c) for (const r of [['📸','Ngày đầu tụ họp','Một ngày đáng nhớ của cả nhóm'],['🍜','Kèo ăn uống','Đói là phải gọi nhau'],['🎮','Đêm game','Thắng thua không quan trọng, vui là chính'],['🌅','Chuyến đi','Một chuyến đi, hàng trăm câu chuyện'],['😂','Khoảnh khắc bất ổn','Không ai biết chuyện gì đang xảy ra'],['🫶','Best friends','Cùng nhau lưu lại thanh xuân']]) await query('INSERT INTO memories(icon,title,description) VALUES($1,$2,$3)', r);
  const tl = await query('SELECT COUNT(*)::int AS c FROM timeline');
  if (!tl.rows[0].c) for (const r of [['2024','Gặp nhau','Những thành viên đầu tiên bắt đầu kết nối.'],['2025','Thân hơn','Từ vài cuộc trò chuyện thành những kèo đi chơi đều đặn.'],['2026','Hàn Thiên Môn khai tông','Thêm nhiều thành viên, nhiều kỷ niệm và nhiều câu chuyện hơn.']]) await query('INSERT INTO timeline(year,title,description) VALUES($1,$2,$3)', r);
}

app.use(express.json());
app.use(express.static(__dirname));
function hashPassword(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }
function safeUser(user) { return { id:user.id, username:user.username, displayName:user.display_name, createdAt:user.created_at }; }
async function auth(req,res,next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({error:'Bạn chưa đăng nhập.'});
    const r = await query('SELECT s.*, u.username, u.display_name, u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND s.expires_at>$2',[token,Date.now()]);
    if (!r.rows.length) return res.status(401).json({error:'Phiên đăng nhập đã hết hạn.'});
    req.session = r.rows[0]; req.token = token; next();
  } catch(e) { res.status(500).json({error:'Lỗi máy chủ.'}); }
}

app.get('/api/health',(req,res)=>res.json({ok:true,service:'Hàn Thiên Môn'}));
app.get('/api/data',async(req,res)=>{try{const [m,mem,t]=await Promise.all([query('SELECT * FROM members ORDER BY id'),query('SELECT icon,title,description FROM memories ORDER BY id'),query('SELECT year,title,description FROM timeline ORDER BY id')]);res.json({members:m.rows.map(x=>({...x,tags:x.tags.split(',')})),memories:mem.rows,timeline:t.rows});}catch(e){res.status(500).json({error:'Không thể tải dữ liệu.'});}});

app.post('/api/register',async(req,res)=>{try{const {username,password,displayName}=req.body||{};if(!username||!password||!displayName)return res.status(400).json({error:'Vui lòng nhập đầy đủ thông tin.'});if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))return res.status(400).json({error:'Tên đăng nhập 3–24 ký tự, chỉ gồm chữ, số và _.'});if(String(password).length<6)return res.status(400).json({error:'Mật khẩu cần ít nhất 6 ký tự.'});const salt=crypto.randomBytes(16).toString('hex');const dn=displayName.trim().slice(0,40);const r=await query('INSERT INTO users(username,password_hash,salt,display_name) VALUES($1,$2,$3,$4) RETURNING id,username,display_name,created_at',[username.toLowerCase(),hashPassword(password,salt),salt,dn]);res.status(201).json({user:safeUser(r.rows[0])});}catch(e){if(e.code==='23505')return res.status(409).json({error:'Tên đăng nhập đã tồn tại.'});res.status(500).json({error:'Không thể tạo tài khoản.'});}});
app.post('/api/login',async(req,res)=>{try{const {username,password}=req.body||{};const r=await query('SELECT * FROM users WHERE username=$1',[String(username||'').toLowerCase()]);const user=r.rows[0];if(!user||hashPassword(String(password||''),user.salt)!==user.password_hash)return res.status(401).json({error:'Tên đăng nhập hoặc mật khẩu không đúng.'});const token=crypto.randomBytes(32).toString('hex');await query('INSERT INTO sessions(token,user_id,expires_at) VALUES($1,$2,$3)',[token,user.id,Date.now()+1000*60*60*24*7]);res.json({token,user:safeUser(user)});}catch(e){res.status(500).json({error:'Không thể đăng nhập.'});}});
app.get('/api/me',auth,(req,res)=>res.json({user:{id:req.session.user_id,username:req.session.username,displayName:req.session.display_name,createdAt:req.session.created_at}}));
app.post('/api/logout',auth,async(req,res)=>{await query('DELETE FROM sessions WHERE token=$1',[req.token]);res.json({ok:true});});
app.post('/api/members',auth,async(req,res)=>{try{const {name,nick,emoji='🧑‍🎨',role='Đệ tử',bio='',birthday='',hobby='',tags=[]}=req.body||{};if(!name||!nick)return res.status(400).json({error:'Thiếu tên hoặc biệt danh.'});const r=await query('INSERT INTO members(name,nick,emoji,role,bio,birthday,hobby,tags) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[name,nick,emoji,role,bio,birthday,hobby,Array.isArray(tags)?tags.join(','):String(tags)]);res.status(201).json({id:r.rows[0].id});}catch(e){res.status(500).json({error:'Không thể thêm môn nhân.'});}});

initDb().then(()=>app.listen(PORT,()=>console.log(`Hàn Thiên Môn đang chạy trên cổng ${PORT}`))).catch(err=>{console.error('Không khởi tạo được database:',err);process.exit(1);});
