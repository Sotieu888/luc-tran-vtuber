let members=[], memories=[], timeline=[];
const $=s=>document.querySelector(s);
const tokenKey='han_thien_token';
const getToken=()=>localStorage.getItem(tokenKey);
const authHeaders=()=>getToken()?{'Authorization':'Bearer '+getToken(),'Content-Type':'application/json'}:{'Content-Type':'application/json'};

async function loadData(){
 const r=await fetch('/api/data'); const data=await r.json(); members=data.members; memories=data.memories; timeline=data.timeline;
 $('#memberCount').textContent=members.length; $('#memoryCount').textContent=memories.length; renderMembers(); renderGallery(); renderTimeline();
}
function renderMembers(list=members){
 $('#membersGrid').innerHTML=list.length?list.map((m,i)=>`<article class="member-card" data-index="${members.indexOf(m)}"><div class="avatar">${m.emoji}</div><div class="member-info"><span class="nickname">${m.nick}</span><h3>${m.name}</h3><p>${m.role}</p><div class="tags">${m.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div></div></article>`).join(''):`<p>Không tìm thấy môn nhân phù hợp.</p>`;
 document.querySelectorAll('.member-card').forEach(c=>c.onclick=()=>openMember(+c.dataset.index));
}
function renderGallery(){ $('#galleryGrid').innerHTML=memories.map(m=>`<article class="memory"><div class="pic">${m.icon}</div><div class="caption">${m.title}<small>${m.description}</small></div></article>`).join(''); }
function renderTimeline(){ $('#timelineList').innerHTML=timeline.map(e=>`<article class="event"><i class="dot"></i><span class="date">${e.year}</span><h3>${e.title}</h3><p>${e.description}</p></article>`).join(''); }
function openMember(i){const m=members[i];$('#modalContent').innerHTML=`<div class="modal-avatar">${m.emoji}</div><div class="modal-content"><span class="nickname">${m.nick}</span><h2>${m.name}</h2><p>${m.bio}</p><div class="facts"><div class="fact"><small>Sinh nhật</small><b>${m.birthday||'—'}</b></div><div class="fact"><small>Sở thích</small><b>${m.hobby||'—'}</b></div></div><div class="tags">${m.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div></div>`;$('#memberModal').showModal();}

function accountUI(user){
 if(user){$('#userBadge').textContent='☯ '+user.displayName;$('#userBadge').classList.remove('hidden');$('#accountBtn').textContent='Hồ sơ';}
 else{$('#userBadge').classList.add('hidden');$('#accountBtn').textContent='☯ Đăng nhập';}
}
async function checkSession(){
 if(!getToken()) return accountUI(null);
 try{const r=await fetch('/api/me',{headers:authHeaders()}); if(!r.ok) throw new Error(); const d=await r.json(); accountUI(d.user);}catch{localStorage.removeItem(tokenKey);accountUI(null);}
}
function openAccount(){
 const logged=!!getToken();
 if(logged){fetch('/api/me',{headers:authHeaders()}).then(r=>r.json()).then(d=>{ $('#accountContent').innerHTML=`<div class="account-box"><div class="avatar-mini">🧙‍♂️</div><span class="eyebrow">ĐÃ NHẬP MÔN</span><h3>${d.user.displayName}</h3><p>Đạo hiệu tài khoản: <b>${d.user.username}</b></p><p>Ngày ghi danh: ${new Date(d.user.createdAt).toLocaleDateString('vi-VN')}</p><button id="logoutBtn" class="btn logout">Rời phiên đăng nhập</button></div>`;$('#accountModal').showModal();$('#logoutBtn').onclick=logout;}); }
 else renderAuth('login');
}
function renderAuth(mode){
 const register=mode==='register';
 $('#accountContent').innerHTML=`<div class="auth-title">寒天門</div><div class="auth-sub">Ghi danh môn nhân · Dữ liệu được lưu trong database</div><div class="tabs"><button class="tab ${!register?'active':''}" data-mode="login">Đăng nhập</button><button class="tab ${register?'active':''}" data-mode="register">Đăng ký</button></div><form id="authForm" class="auth-form"><div class="field ${register?'':'hidden'}"><label>Danh xưng</label><input id="displayName" maxlength="40" ${register?'required':''} placeholder="Tên hiển thị"></div><div class="field"><label>Tên tài khoản</label><input id="username" required minlength="3" maxlength="24" autocomplete="username" placeholder="tu_tien_01"></div><div class="field"><label>Mật khẩu</label><input id="password" type="password" required minlength="6" autocomplete="current-password" placeholder="Ít nhất 6 ký tự"></div><button class="btn primary" type="submit">${register?'Ghi danh vào sơn môn':'Nhập môn'}</button><div id="authMsg" class="auth-msg"></div></form>`;
 document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>renderAuth(b.dataset.mode));
 $('#authForm').onsubmit=async e=>{e.preventDefault();const msg=$('#authMsg');msg.textContent='Đang xử lý...';const body={username:$('#username').value.trim(),password:$('#password').value};if(register)body.displayName=$('#displayName').value.trim();const endpoint=register?'/api/register':'/api/login';try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw new Error(d.error||'Có lỗi xảy ra.');if(register){msg.textContent='Ghi danh thành công. Đang chuyển sang đăng nhập...';setTimeout(()=>renderAuth('login'),500);}else{localStorage.setItem(tokenKey,d.token);accountUI(d.user);$('#accountModal').close();}}catch(err){msg.textContent=err.message;}};
 $('#accountModal').showModal();
}
async function logout(){try{await fetch('/api/logout',{method:'POST',headers:authHeaders()});}finally{localStorage.removeItem(tokenKey);accountUI(null);$('#accountModal').close();}}

$('#modalClose').onclick=()=>$('#memberModal').close();$('#accountClose').onclick=()=>$('#accountModal').close();
$('#memberModal').onclick=e=>{if(e.target===e.currentTarget)e.currentTarget.close()};$('#accountModal').onclick=e=>{if(e.target===e.currentTarget)e.currentTarget.close()};
$('#searchInput').oninput=e=>{const q=e.target.value.toLowerCase().trim();renderMembers(members.filter(m=>[m.name,m.nick,m.role,...m.tags].join(' ').toLowerCase().includes(q)));};
$('#accountBtn').onclick=openAccount;$('#joinBtn').onclick=()=>getToken()?openAccount():renderAuth('register');
$('#themeBtn').onclick=()=>{document.body.classList.toggle('dark');const dark=document.body.classList.contains('dark');$('#themeBtn').textContent=dark?'☀':'☾';localStorage.setItem('theme',dark?'dark':'light');};
$('#menuBtn').onclick=()=>$('#nav').classList.toggle('open');document.querySelectorAll('#nav a').forEach(a=>a.onclick=()=>$('#nav').classList.remove('open'));$('#topBtn').onclick=()=>scrollTo({top:0,behavior:'smooth'});
if(localStorage.getItem('theme')==='dark'){document.body.classList.add('dark');$('#themeBtn').textContent='☀';}
loadData();checkSession();
