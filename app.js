import {FaceLandmarker, FilesetResolver} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm";

const canvas=document.getElementById("stage"),ctx=canvas.getContext("2d");
const video=document.getElementById("cam"),start=document.getElementById("start");
const status=document.getElementById("status"),help=document.getElementById("help"),tools=document.getElementById("tools");

let W=0,H=0,D=1,face=null,stream=null,micStream=null,audio=null,analyser=null,data=null;
let running=false,muted=false,auraOn=true,mirror=false,lastVideo=-1,raf=0;

const S={
  t:0, headX:0,headY:0,headR:0, gazeX:0,gazeY:0,blink:0,mouth:0,voice:0,
  hair:0.0,robe:0.0
};

const particles=Array.from({length:110},(_,i)=>({
  a:Math.random()*Math.PI*2,r:210+Math.random()*430,
  speed:.15+Math.random()*.55,size:.5+Math.random()*1.8,phase:Math.random()*10
}));

function resize(){
  W=innerWidth;H=innerHeight;D=Math.min(devicePixelRatio||1,2);
  canvas.width=W*D;canvas.height=H*D;canvas.style.width=W+"px";canvas.style.height=H+"px";
  ctx.setTransform(D,0,0,D,0,0);
}
addEventListener("resize",resize);resize();

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;

function setStatus(v){status.textContent=v}

async function setupFace(){
  const fs=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
  face=await FaceLandmarker.createFromOptions(fs,{
    baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"},
    runningMode:"VIDEO",numFaces:1,outputFaceBlendshapes:true
  });
}

async function setupMic(){
  try{
    micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC)return;
    audio=new AC(); if(audio.state==="suspended")await audio.resume();
    const src=audio.createMediaStreamSource(micStream);
    analyser=audio.createAnalyser();analyser.fftSize=256;data=new Uint8Array(analyser.fftSize);src.connect(analyser);
  }catch(e){muted=true}
}

function readMic(){
  if(!analyser||muted){S.voice=lerp(S.voice,0,.25);return}
  analyser.getByteTimeDomainData(data);let q=0;
  for(const n of data){const z=(n-128)/128;q+=z*z}
  S.voice=lerp(S.voice,clamp(Math.sqrt(q/data.length)*4,0,1),.24);
}

function track(res){
  const p=res.faceLandmarks?.[0]; if(!p)return;
  // Nose position -> head movement.
  S.headX=clamp((.5-p[1].x)*1.9,-1,1);
  S.headY=clamp((p[1].y-.47)*1.6,-.9,.9);
  S.headR=clamp(Math.atan2(p[263].y-p[33].y,p[263].x-p[33].x),-.55,.55);

  const b=Object.fromEntries((res.faceBlendshapes?.[0]?.categories||[]).map(v=>[v.categoryName,v.score]));
  S.blink=clamp(((b.eyeBlinkLeft||0)+(b.eyeBlinkRight||0))*.7,0,1);
  S.mouth=clamp((b.jawOpen||0)*1.6,0,1);

  // Iris blendshapes if available.
  const gx=((b.eyeLookOutLeft||0)-(b.eyeLookInLeft||0)+(b.eyeLookInRight||0)-(b.eyeLookOutRight||0))*.65;
  const gy=((b.eyeLookDownLeft||0)+(b.eyeLookDownRight||0)-(b.eyeLookUpLeft||0)-(b.eyeLookUpRight||0))*.55;
  S.gazeX=clamp(gx,-1,1);S.gazeY=clamp(gy,-1,1);
}

function background(){
  ctx.fillStyle="#020711";ctx.fillRect(0,0,W,H);
  const g=ctx.createRadialGradient(W*.5,H*.43,10,W*.5,H*.48,Math.min(W*.8,650));
  g.addColorStop(0,"rgba(67,195,255,.18)");g.addColorStop(.42,"rgba(29,78,150,.10)");g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(W*.5,H*.48,Math.min(W*.8,650),0,Math.PI*2);ctx.fill();

  if(auraOn){
    ctx.save();ctx.translate(W/2,H*.48);
    for(let i=0;i<5;i++){
      ctx.rotate(S.t*(.025+i*.008));
      ctx.strokeStyle=`rgba(90,213,255,${.11-i*.014})`;ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(0,0,170+i*58,255+i*70,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
  }
}

function drawAura(){
  if(!auraOn)return;
  ctx.save();ctx.globalCompositeOperation="lighter";
  const rg=ctx.createRadialGradient(W/2,H*.48,20,W/2,H*.48,Math.min(W*.58,480));
  rg.addColorStop(0,"rgba(93,214,255,.18)");rg.addColorStop(.55,"rgba(68,152,255,.06)");rg.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=rg;ctx.beginPath();ctx.arc(W/2,H*.48,Math.min(W*.58,480),0,Math.PI*2);ctx.fill();

  for(const p of particles){
    const a=p.a+S.t*p.speed*.06,r=p.r+Math.sin(S.t*.9+p.phase)*18;
    const x=W/2+Math.cos(a)*r,y=H*.49+Math.sin(a)*r*.72;
    ctx.globalAlpha=.15+.25*(.5+.5*Math.sin(S.t+p.phase));
    ctx.fillStyle="#8be6ff";ctx.shadowColor="#36caff";ctx.shadowBlur=10;
    ctx.beginPath();ctx.arc(x,y,p.size,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.restore();
}

function drawSystemPanels(){
  // Decorative panels echo the reference image, kept behind the character.
  ctx.save();
  ctx.font="700 10px system-ui";ctx.fillStyle="rgba(159,235,255,.86)";
  ctx.strokeStyle="rgba(72,199,255,.34)";ctx.lineWidth=1;
  const x=W-160,y=82,w=137,h=102;
  ctx.strokeRect(x,y,w,h);
  ctx.fillText("HỆ THỐNG VẠN GIỚI",x+9,y+20);
  ctx.font="9px system-ui";ctx.fillStyle="#70dfff";
  ctx.fillText("Tên: Lục Trần",x+9,y+42);
  ctx.fillText("Tuổi: 16",x+9,y+57);
  ctx.fillText("Cảnh giới: Vô Thượng",x+9,y+72);
  ctx.fillText("Thiên phú: Thượng Cổ",x+9,y+87);
  ctx.restore();
}

function drawLayeredLucTran(){
  const cx=W/2+S.headX*W*.055, cy=H*.47+S.headY*H*.018;
  const sc=Math.min(W/510,1.08);

  ctx.save();ctx.translate(cx,cy);ctx.rotate(S.headR*.10);ctx.scale(sc,sc);

  // === LAYER 1: AURA RIBBONS ===
  if(auraOn){
    ctx.save();ctx.globalCompositeOperation="lighter";ctx.strokeStyle="rgba(104,220,255,.65)";
    ctx.shadowColor="#47cfff";ctx.shadowBlur=16;ctx.lineWidth=2;
    for(let i=0;i<4;i++){
      const yy=90+i*80+Math.sin(S.t*1.2+i)*8;
      ctx.beginPath();ctx.moveTo(-250,yy);ctx.bezierCurveTo(-90,yy-55,80,yy+65,250,yy-15);ctx.stroke();
    }
    ctx.restore();
  }

  // === LAYER 2: BODY / WHITE ROBE ===
  const sway=Math.sin(S.t*1.15)*5+S.headX*9;
  ctx.save();ctx.translate(sway,0);
  const robe=ctx.createLinearGradient(-290,70,300,690);
  robe.addColorStop(0,"#ffffff");robe.addColorStop(.38,"#dce8f5");robe.addColorStop(.72,"#9eb6cf");robe.addColorStop(1,"#425e7d");
  ctx.fillStyle=robe;
  ctx.beginPath();
  ctx.moveTo(-260,95);ctx.quadraticCurveTo(-335,300,-292,665);
  ctx.lineTo(-55,610);ctx.lineTo(0,500);ctx.lineTo(55,610);ctx.lineTo(292,665);
  ctx.quadraticCurveTo(335,300,260,95);ctx.lineTo(85,45);ctx.lineTo(0,190);ctx.lineTo(-85,45);ctx.closePath();ctx.fill();

  // long sleeve left
  ctx.fillStyle="#edf6ff";ctx.beginPath();
  ctx.moveTo(-120,120);ctx.quadraticCurveTo(-265,175,-320,380);
  ctx.quadraticCurveTo(-330,460,-255,505);ctx.quadraticCurveTo(-200,360,-75,225);ctx.closePath();ctx.fill();

  // long sleeve right
  ctx.fillStyle="#d8e6f3";ctx.beginPath();
  ctx.moveTo(120,120);ctx.quadraticCurveTo(265,175,320,380);
  ctx.quadraticCurveTo(330,460,255,505);ctx.quadraticCurveTo(200,360,75,225);ctx.closePath();ctx.fill();

  // blue inner robe
  ctx.fillStyle="#102d50";ctx.beginPath();
  ctx.moveTo(-75,85);ctx.lineTo(0,205);ctx.lineTo(75,85);ctx.lineTo(110,550);ctx.lineTo(0,615);ctx.lineTo(-110,550);ctx.closePath();ctx.fill();

  // robe folds
  ctx.strokeStyle="rgba(63,105,143,.55)";ctx.lineWidth=7;ctx.lineCap="round";
  for(let i=-3;i<=3;i++){ctx.beginPath();ctx.moveTo(i*48,190);ctx.quadraticCurveTo(i*55+sway,390,i*38,610);ctx.stroke();}
  ctx.restore();

  // === LAYER 3: NECK + FACE ===
  ctx.fillStyle="#e9bca8";ctx.fillRect(-45,60,90,110);

  // ears
  ctx.fillStyle="#d9a696";ctx.beginPath();ctx.ellipse(-145,-42,21,34,0,0,Math.PI*2);ctx.ellipse(145,-42,21,34,0,0,Math.PI*2);ctx.fill();

  // Face: narrow, elegant, reference-like
  ctx.fillStyle="#f2cdb9";
  ctx.beginPath();
  ctx.moveTo(-150,-88);ctx.quadraticCurveTo(-143,-205,0,-239);
  ctx.quadraticCurveTo(143,-205,150,-88);
  ctx.quadraticCurveTo(143,57,0,138);
  ctx.quadraticCurveTo(-143,57,-150,-88);ctx.closePath();ctx.fill();

  // cheek light
  const skin=ctx.createRadialGradient(-40,-45,10,0,0,170);
  skin.addColorStop(0,"rgba(255,255,255,.18)");skin.addColorStop(1,"rgba(255,255,255,0)");
  ctx.fillStyle=skin;ctx.beginPath();ctx.ellipse(0,-25,145,165,0,0,Math.PI*2);ctx.fill();

  // === LAYER 4: HAIR BACK ===
  ctx.fillStyle="#07101d";
  ctx.beginPath();ctx.ellipse(0,-205,192,170,0,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.moveTo(-175,-190);ctx.quadraticCurveTo(-225,-40,-175,245);ctx.lineTo(-115,175);ctx.lineTo(-104,-100);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(175,-190);ctx.quadraticCurveTo(225,-40,175,245);ctx.lineTo(115,175);ctx.lineTo(104,-100);ctx.closePath();ctx.fill();

  // flowing hair strands — independent layer motion
  ctx.strokeStyle="#1c3049";ctx.lineWidth=12;ctx.lineCap="round";
  for(let i=-6;i<=6;i++){
    const x=i*28+S.headX*10;
    const wave=Math.sin(S.t*1.35+i*.7)*10;
    ctx.beginPath();ctx.moveTo(x,-265);ctx.bezierCurveTo(x-28+wave,-110,x+25-wave,80,x+Math.sin(S.t+i)*18,220);ctx.stroke();
  }

  // === LAYER 5: FRONT BANGS ===
  ctx.fillStyle="#080f1a";
  ctx.beginPath();
  ctx.moveTo(-180,-205);ctx.quadraticCurveTo(-82,-305,0,-252);ctx.quadraticCurveTo(90,-305,180,-205);
  ctx.lineTo(126,-124);ctx.lineTo(66,-186);ctx.lineTo(15,-88);ctx.lineTo(-26,-181);ctx.lineTo(-105,-108);ctx.closePath();ctx.fill();

  // hair shine
  ctx.strokeStyle="rgba(86,119,150,.5)";ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(-78,-239);ctx.quadraticCurveTo(-45,-260,-18,-245);ctx.stroke();
  ctx.beginPath();ctx.moveTo(48,-247);ctx.quadraticCurveTo(82,-257,112,-220);ctx.stroke();

  // === LAYER 6: EYES ===
  const open=1-S.blink;
  for(const side of [-1,1]){
    const ex=side*61,ey=-38;
    ctx.save();
    ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(ex,ey,43,27*open+2,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#172637";ctx.lineWidth=5;
    ctx.beginPath();ctx.moveTo(ex-37,ey-9);ctx.quadraticCurveTo(ex,ey-28,ex+40,ey-7);ctx.stroke();
    ctx.fillStyle="#65ddff";ctx.shadowColor="#32caff";ctx.shadowBlur=15;
    ctx.beginPath();ctx.ellipse(ex+S.gazeX*17,ey+S.gazeY*8,15,18*open+2,0,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle="#06111b";
    ctx.beginPath();ctx.arc(ex+S.gazeX*17,ey+S.gazeY*8,6,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }

  // === LAYER 7: NOSE + MOUTH ===
  ctx.strokeStyle="#b98276";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-16);ctx.quadraticCurveTo(-6,18,7,24);ctx.stroke();
  const mouth=cl(S.mouth*.72+S.voice*.58,0,1),mw=21+mouth*38,mh=2+mouth*20;
  ctx.fillStyle="#542431";ctx.beginPath();ctx.ellipse(0,78,mw,mh,0,0,Math.PI*2);ctx.fill();
  if(mouth>.2){ctx.fillStyle="#fff";ctx.fillRect(-mw*.52,70,mw*1.04,4)}

  // === LAYER 8: HAIR ORNAMENT ===
  ctx.fillStyle="#8eeaff";ctx.shadowColor="#4bd5ff";ctx.shadowBlur=20;
  ctx.beginPath();ctx.arc(0,-270,12,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  ctx.strokeStyle="#a9edff";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(0,-263);ctx.lineTo(0,-330);ctx.stroke();

  // === LAYER 9: CHEST TALISMAN ===
  ctx.fillStyle="#65dcff";ctx.shadowColor="#42cbff";ctx.shadowBlur=18;
  ctx.beginPath();ctx.moveTo(0,225);ctx.lineTo(19,247);ctx.lineTo(0,274);ctx.lineTo(-19,247);ctx.closePath();ctx.fill();ctx.shadowBlur=0;

  ctx.restore();

  // === LAYER 10: SWORD ===
  drawSword(cx,cy,sc);
}

function drawSword(cx,cy,sc){
  ctx.save();ctx.translate(cx+W*.235,cy+H*.05);ctx.rotate(-.13+S.headR*.22);
  ctx.globalCompositeOperation="lighter";ctx.shadowColor="#54d9ff";ctx.shadowBlur=22;
  ctx.strokeStyle="#f2fcff";ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(0,185);ctx.lineTo(55,-265);ctx.stroke();
  ctx.shadowBlur=0;ctx.strokeStyle="#63dfff";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,185);ctx.lineTo(55,-265);ctx.stroke();
  ctx.fillStyle="#b9f0ff";ctx.beginPath();ctx.arc(0,185,16,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function render(){
  readMic();
  S.t+=.016;
  S.headX=lerp(S.headX,S.headX,.0); // keep state stable between detections
  background();
  drawAura();
  drawLayeredLucTran();
  drawSystemPanels();
}

async function begin(){
  start.disabled=true;help.textContent="Đang xin quyền Camera…";setStatus("Đang bật camera…");
  try{
    if(!isSecureContext)throw new Error("HTTPS");
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:720},height:{ideal:1280}},audio:false});
    video.srcObject=stream;await video.play();
    help.textContent="Camera OK • đang bật microphone…";setStatus("Camera OK");
    await setupMic();
    try{await setupFace();setStatus("LỤC TRẦN • LIVE")}catch(e){console.warn(e);setStatus("LỤC TRẦN • CAMERA LIVE")}
    document.body.classList.add("live");tools.hidden=false;running=true;
    cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);
  }catch(e){
    console.error(e);start.disabled=false;
    const msg=e.message==="HTTPS"?"Hãy mở trang bằng HTTPS":e.name==="NotAllowedError"?"Safari đã chặn Camera/Microphone":e.name==="NotFoundError"?"Không tìm thấy Camera":e.name==="NotReadableError"?"Camera đang được ứng dụng khác sử dụng":"Không thể khởi động Camera";
    setStatus(msg);help.textContent=msg;
    alert(msg+"\n\nVào Cài đặt → Ứng dụng → Safari → Camera/Microphone → Cho phép, rồi tải lại trang.");
  }
}

function loop(time){
  if(!running)return;
  if(face&&video.readyState>=2&&video.currentTime!==lastVideo){
    try{track(face.detectForVideo(video,time))}catch(e){console.warn(e)}
    lastVideo=video.currentTime;
  }
  render();raf=requestAnimationFrame(loop);
}

start.onclick=begin;
document.getElementById("center").onclick=()=>{S.headX=0;S.headY=0;S.headR=0;S.gazeX=0;S.gazeY=0};
document.getElementById("mute").onclick=e=>{muted=!muted;e.currentTarget.textContent=muted?"🔇":"🎙";if(micStream)micStream.getAudioTracks().forEach(t=>t.enabled=!muted)};
document.getElementById("mirror").onclick=()=>{mirror=!mirror;canvas.style.transform=mirror?"scaleX(-1)":"none"};
document.getElementById("aura").onclick=e=>{auraOn=!auraOn;e.currentTarget.textContent=auraOn?"✦":"○"};

render();
