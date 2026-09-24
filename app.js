
const canvas=document.getElementById("stage"),ctx=canvas.getContext("2d");
const video=document.getElementById("cam"),start=document.getElementById("start");
const status=document.getElementById("status"),help=document.getElementById("help");
const tools=document.getElementById("tools");

let W,H,D,face=null,stream=null,micStream=null,audio=null,analyser=null,data=null;
let running=false,muted=false,auraOn=true,lastVideo=-1,raf=0;
const S={x:0,y:0,rot:0,blink:0,mouth:0,tx:0,ty:0,tr:0,tb:0,tm:0,voice:0,t:0};
const particles=Array.from({length:85},()=>({a:Math.random()*Math.PI*2,r:190+Math.random()*420,s:Math.random()*1.5+.4}));

function resize(){W=innerWidth;H=innerHeight;D=Math.min(devicePixelRatio||1,2);canvas.width=W*D;canvas.height=H*D;ctx.setTransform(D,0,0,D,0,0)}
addEventListener("resize",resize);resize();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
function setStatus(t){status.textContent=t}

async function setupFace(){
  const mod=await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm");
  const FS=mod.FilesetResolver,FL=mod.FaceLandmarker;
  const fs=await FS.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
  face=await FL.createFromOptions(fs,{
    baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"},
    runningMode:"VIDEO",numFaces:1,outputFaceBlendshapes:true
  });
}

async function setupMic(){
  try{
    micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    audio=new AC();
    if(audio.state==="suspended")await audio.resume();
    const src=audio.createMediaStreamSource(micStream);
    analyser=audio.createAnalyser(); analyser.fftSize=256; data=new Uint8Array(analyser.fftSize);
    src.connect(analyser);
  }catch(e){muted=true}
}

function readMic(){
  if(!analyser||muted){S.voice=lerp(S.voice,0,.3);return}
  analyser.getByteTimeDomainData(data);let q=0;
  for(const n of data){let z=(n-128)/128;q+=z*z}
  S.voice=lerp(S.voice,clamp(Math.sqrt(q/data.length)*3.7,0,1),.24);
}

function track(r){
  const p=r.faceLandmarks?.[0]; if(!p)return;
  // Head movement
  S.tx=clamp((.5-p[1].x)*1.8,-1,1);
  S.ty=clamp((p[1].y-.47)*1.5,-.8,.8);
  S.tr=clamp(Math.atan2(p[263].y-p[33].y,p[263].x-p[33].x),-.55,.55);
  const b=Object.fromEntries((r.faceBlendshapes?.[0]?.categories||[]).map(v=>[v.categoryName,v.score]));
  S.tb=clamp(((b.eyeBlinkLeft||0)+(b.eyeBlinkRight||0))*.65,0,1);
  S.tm=clamp((b.jawOpen||0)*1.65,0,1);
}

function background(){
  ctx.fillStyle="#020711";ctx.fillRect(0,0,W,H);
  const g=ctx.createRadialGradient(W*.5,H*.42,10,W*.5,H*.48,Math.min(W*.78,620));
  g.addColorStop(0,"rgba(57,188,255,.22)");g.addColorStop(.42,"rgba(24,80,150,.12)");g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(W*.5,H*.48,Math.min(W*.78,620),0,Math.PI*2);ctx.fill();
  // cultivation rings
  if(auraOn){
    ctx.save();ctx.translate(W/2,H*.47);
    for(let i=0;i<4;i++){
      ctx.rotate(S.t*(.04+i*.01));ctx.strokeStyle=`rgba(93,210,255,${.13-i*.02})`;ctx.lineWidth=1.2;
      ctx.beginPath();ctx.ellipse(0,0,170+i*54,260+i*65,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }
}

function drawParticles(){
  for(const p of particles){
    const a=p.a+S.t*(.025+p.s*.006),r=p.r+Math.sin(S.t*1.3+p.a)*18;
    const px=W/2+Math.cos(a)*r,py=H*.5+Math.sin(a)*r*.75;
    ctx.globalAlpha=.12+.32*Math.random();ctx.fillStyle="#76dcff";ctx.shadowColor="#32c5ff";ctx.shadowBlur=8;
    ctx.beginPath();ctx.arc(px,py,p.s,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;ctx.shadowBlur=0;
}

function drawSword(cx,cy,sc){
  ctx.save();ctx.translate(cx+W*.24,cy+H*.05);ctx.rotate(-.16+S.rot*.2);
  ctx.shadowColor="#5fd7ff";ctx.shadowBlur=22;ctx.strokeStyle="#eefcff";ctx.lineWidth=8;
  ctx.beginPath();ctx.moveTo(0,170);ctx.lineTo(48,-250);ctx.stroke();
  ctx.shadowBlur=0;ctx.strokeStyle="#75dfff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,170);ctx.lineTo(48,-250);ctx.stroke();
  ctx.fillStyle="#bdefff";ctx.beginPath();ctx.arc(0,172,16,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawLuChen(){
  const cx=W/2+S.x*W*.055,cy=H*.46+S.y*H*.025,sc=Math.min(W/500,1.15);
  ctx.save();ctx.translate(cx,cy);ctx.rotate(S.rot*.14);ctx.scale(sc,sc);

  // Long flowing robe
  const robe=ctx.createLinearGradient(-280,100,280,700);
  robe.addColorStop(0,"#f7fbff");robe.addColorStop(.46,"#c9dced");robe.addColorStop(1,"#516f94");
  ctx.fillStyle=robe;
  ctx.beginPath();ctx.moveTo(-260,100);ctx.quadraticCurveTo(-350,360,-260,700);ctx.lineTo(0,615);ctx.lineTo(260,700);
  ctx.quadraticCurveTo(350,360,260,100);ctx.lineTo(78,72);ctx.lineTo(0,230);ctx.lineTo(-78,72);ctx.closePath();ctx.fill();

  // Blue inner robe
  ctx.fillStyle="#142f52";ctx.beginPath();ctx.moveTo(-78,90);ctx.lineTo(0,235);ctx.lineTo(78,90);ctx.lineTo(120,540);ctx.lineTo(0,600);ctx.lineTo(-120,540);ctx.closePath();ctx.fill();

  // Neck
  ctx.fillStyle="#e8bda5";ctx.fillRect(-48,58,96,125);

  // Face: refined, pale, narrow anime/xianxia proportions
  ctx.fillStyle="#f0cbb8";ctx.beginPath();ctx.moveTo(-150,-80);ctx.quadraticCurveTo(-145,-205,0,-245);
  ctx.quadraticCurveTo(145,-205,150,-80);ctx.quadraticCurveTo(136,72,0,145);
  ctx.quadraticCurveTo(-136,72,-150,-80);ctx.closePath();ctx.fill();

  // Ear shadows
  ctx.fillStyle="#dcae9d";ctx.beginPath();ctx.ellipse(-148,-42,20,34,0,0,Math.PI*2);ctx.ellipse(148,-42,20,34,0,0,Math.PI*2);ctx.fill();

  // Long black hair mass
  ctx.fillStyle="#080f1b";ctx.beginPath();ctx.ellipse(0,-205,190,170,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(-178,-190);ctx.quadraticCurveTo(-225,-55,-168,210);ctx.lineTo(-120,160);ctx.lineTo(-105,-95);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(178,-190);ctx.quadraticCurveTo(225,-55,168,210);ctx.lineTo(120,160);ctx.lineTo(105,-95);ctx.closePath();ctx.fill();

  // Hair highlights
  ctx.strokeStyle="#24364e";ctx.lineWidth=12;ctx.lineCap="round";
  for(let i=-5;i<=5;i++){
    const hx=i*29+S.x*18+Math.sin(S.t*1.7+i)*8;
    ctx.beginPath();ctx.moveTo(hx,-250);ctx.quadraticCurveTo(hx-25,-95,hx+i*11,150+Math.sin(S.t+i)*18);ctx.stroke();
  }

  // Framing bangs
  ctx.fillStyle="#0a1321";
  ctx.beginPath();ctx.moveTo(-178,-195);ctx.quadraticCurveTo(-85,-305,0,-248);ctx.quadraticCurveTo(90,-305,178,-195);
  ctx.lineTo(120,-125);ctx.lineTo(55,-190);ctx.lineTo(8,-86);ctx.lineTo(-28,-185);ctx.lineTo(-105,-110);ctx.closePath();ctx.fill();

  // Eyes with live gaze + blink
  const open=1-S.blink;
  for(const side of [-1,1]){
    const ex=side*62,ey=-37;
    ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(ex,ey,43,27*open+2,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#182536";ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(ex-36,ey-8);ctx.quadraticCurveTo(ex,ey-27,ex+39,ey-7);ctx.stroke();
    ctx.fillStyle="#62d8ff";ctx.shadowColor="#35c8ff";ctx.shadowBlur=13;
    ctx.beginPath();ctx.ellipse(ex+S.x*17,ey+S.y*8,16,18*open+2,0,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.fillStyle="#06111c";ctx.beginPath();ctx.arc(ex+S.x*17,ey+S.y*8,6,0,Math.PI*2);ctx.fill();
  }

  // Nose / elegant small mouth
  ctx.strokeStyle="#bc897f";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-15);ctx.quadraticCurveTo(-6,18,7,25);ctx.stroke();
  const mouth=cl(S.mouth*.75+S.voice*.55,0,1),mw=22+mouth*40,mh=2+mouth*22;
  ctx.fillStyle="#522534";ctx.beginPath();ctx.ellipse(0,77,mw,mh,0,0,Math.PI*2);ctx.fill();
  if(mouth>.2){ctx.fillStyle="#fff";ctx.fillRect(-mw*.55,70,mw*1.1,4)}

  // Hair ornament
  ctx.fillStyle="#8ee8ff";ctx.shadowColor="#4ed4ff";ctx.shadowBlur=18;ctx.beginPath();ctx.arc(0,-270,12,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.strokeStyle="#a7e9ff";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-265);ctx.lineTo(0,-330);ctx.stroke();

  // Chest ornament
  ctx.fillStyle="#68d9ff";ctx.shadowColor="#4bcaff";ctx.shadowBlur=18;ctx.beginPath();ctx.arc(0,245,18,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;

  ctx.restore();
  drawSword(cx,cy,sc);
}

function ui(){
  ctx.fillStyle="#c9f2ff";ctx.font="700 11px system-ui";
  ctx.fillText("HỆ THỐNG VẠN GIỚI",W-170,95);
  ctx.font="10px system-ui";ctx.fillStyle="#76dfff";
  ctx.fillText("Lục Trần",W-170,114);ctx.fillText("Cảnh giới: Vô Thượng",W-170,130);
  ctx.fillText("Linh căn: Thượng Cổ",W-170,146);
}

function render(){
  readMic();S.t+=.016;
  S.x=lerp(S.x,S.tx,.14);S.y=lerp(S.y,S.ty,.14);S.rot=lerp(S.rot,S.tr,.14);
  S.blink=lerp(S.blink,S.tb,.32);S.mouth=lerp(S.mouth,S.tm,.3);
  background();drawParticles();drawLuChen();ui();
}

function readMic(){
  if(!analyser||muted){S.voice=lerp(S.voice,0,.3);return}
  analyser.getByteTimeDomainData(data);let q=0;
  for(const n of data){const z=(n-128)/128;q+=z*z}
  S.voice=lerp(S.voice,clamp(Math.sqrt(q/data.length)*3.7,0,1),.24);
}

async function begin(){
  start.disabled=true;help.textContent="Đang xin quyền Camera…";setStatus("Đang bật camera…");
  try{
    if(!isSecureContext)throw new Error("HTTPS");
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:720},height:{ideal:1280}},audio:false});
    video.srcObject=stream;await video.play();
    help.textContent="Camera OK • đang bật microphone…";setStatus("Camera OK");
    await setupMic();
    try{await setupFace();setStatus("Lục Trần • LIVE")}catch(e){setStatus("Lục Trần • Camera LIVE")}
    document.body.classList.add("live");tools.hidden=false;running=true;
    cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);
  }catch(e){
    start.disabled=false;console.error(e);
    let t=e.message==="HTTPS"?"Hãy mở trang bằng HTTPS":e.name==="NotAllowedError"?"Safari đã chặn Camera/Microphone":e.name==="NotFoundError"?"Không tìm thấy Camera":e.name==="NotReadableError"?"Camera đang được ứng dụng khác sử dụng":"Không thể khởi động Camera";
    setStatus(t);help.textContent=t;
    alert(t+"\n\nVào Cài đặt → Ứng dụng → Safari → Camera/Microphone → Cho phép, rồi tải lại trang.");
  }
}

function loop(time){
  if(!running)return;
  if(face&&video.readyState>=2&&video.currentTime!==lastVideo){
    try{track(face.detectForVideo(video,time))}catch(e){}
    lastVideo=video.currentTime;
  }
  render();raf=requestAnimationFrame(loop);
}
start.onclick=begin;
document.getElementById("center").onclick=()=>{S.tx=0;S.ty=0;S.tr=0};
document.getElementById("mute").onclick=e=>{muted=!muted;e.currentTarget.textContent=muted?"🔇":"🎙";if(micStream)micStream.getAudioTracks().forEach(t=>t.enabled=!muted)};
document.getElementById("mirror").onclick=()=>video.style.transform=video.style.transform?"":"scaleX(-1)";
document.getElementById("aura").onclick=e=>{auraOn=!auraOn;e.currentTarget.textContent=auraOn?"✦":"○"};
render();
