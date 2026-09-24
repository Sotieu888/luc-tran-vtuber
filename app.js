import * as THREE from "three";
import {FaceLandmarker, FilesetResolver} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm";

const video=document.getElementById("camera"), canvas=document.getElementById("scene");
const startBtn=document.getElementById("start"), state=document.getElementById("state"), msg=document.getElementById("msg");
const buttons=document.getElementById("buttons");

let renderer,scene,camera,avatar,head,neck,eyeL,eyeR,pupilL,pupilR,mouth,hairGroup,robe,sleeveL,sleeveR,sword,auraGroup;
let face=null,stream=null,micStream=null,audio=null,analyser=null,audioData=null;
let running=false,muted=false,fx=true,mirror=false,lastTime=-1,t=0;
const T={hx:0,hy:0,hr:0,gx:0,gy:0,blink:0,jaw:0,voice:0};

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const lerp=(a,b,k)=>a+(b-a)*k;

function mat(color,rough=.55,metal=.05,emissive=null){
  return new THREE.MeshStandardMaterial({
    color,roughness:rough,metalness:metal,
    emissive:emissive||0x000000,emissiveIntensity:emissive?1.8:0
  });
}
const skin=mat(0xf0c8b7,.8);
const white=mat(0xeaf4ff,.5,.08);
const blueWhite=mat(0xb9d3e9,.52,.08);
const dark=mat(0x07111f,.34,.1);
const deepBlue=mat(0x102d51,.38,.18);
const cyan=mat(0x5fe4ff,.25,.4,0x3acfff);

function init3D(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
  renderer.setSize(innerWidth,innerHeight,false);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.15;

  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x020711);
  camera=new THREE.PerspectiveCamera(27,innerWidth/innerHeight,.1,100);
  camera.position.set(0,1.55,7.7);

  const hemi=new THREE.HemisphereLight(0xbfe9ff,0x07101c,2.0);
  scene.add(hemi);
  const key=new THREE.DirectionalLight(0xffffff,3.0);key.position.set(-3,5,6);scene.add(key);
  const rim=new THREE.PointLight(0x2dbfff,15,12);rim.position.set(3,2,2);scene.add(rim);
  const fill=new THREE.PointLight(0x4d7dff,8,10);fill.position.set(-3,1,-1);scene.add(fill);

  avatar=new THREE.Group();avatar.position.y=-1.05;scene.add(avatar);
  buildAvatar();
  buildAura();
  addStars();
}

function buildAvatar(){
  // torso and robe: layered xianxia silhouette
  robe=new THREE.Group();avatar.add(robe);
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.78,1.9,8,20),white);
  torso.position.y=1.0;torso.scale.set(1.05,1,0.62);robe.add(torso);

  const inner=new THREE.Mesh(new THREE.ConeGeometry(.72,2.55,5,1,true),deepBlue);
  inner.position.set(0,.65,.18);inner.rotation.y=Math.PI/4;inner.scale.set(.95,1,.65);robe.add(inner);

  const skirt=new THREE.Mesh(new THREE.ConeGeometry(1.72,2.6,7,1,true),blueWhite);
  skirt.position.set(0,-.18,0);skirt.scale.set(1,.95,.65);robe.add(skirt);

  sleeveL=makeSleeve(-1);sleeveR=makeSleeve(1);
  robe.add(sleeveL,sleeveR);

  neck=new THREE.Mesh(new THREE.CylinderGeometry(.25,.29,.5,24),skin);
  neck.position.y=2.05;avatar.add(neck);

  // head: narrow anime-like ellipsoid + jaw overlay
  head=new THREE.Group();head.position.y=2.9;avatar.add(head);
  const faceGeo=new THREE.SphereGeometry(1,48,32);
  const face=new THREE.Mesh(faceGeo,skin);face.scale.set(.83,1.02,.72);face.position.y=.03;head.add(face);
  const jaw=new THREE.Mesh(new THREE.SphereGeometry(.72,40,24),skin);
  jaw.scale.set(.93,.72,.78);jaw.position.set(0,-.48,.05);head.add(jaw);

  // ears
  for(const x of [-.78,.78]){
    const ear=new THREE.Mesh(new THREE.SphereGeometry(.17,20,14),skin);ear.scale.set(.7,1.25,.55);ear.position.set(x,-.02,0);head.add(ear);
  }

  // eyes
  eyeL=makeEye(-.31,.08,.69);eyeR=makeEye(.31,.08,.69);
  head.add(eyeL.group,eyeR.group);
  pupilL=eyeL.pupil;pupilR=eyeR.pupil;

  mouth=new THREE.Mesh(new THREE.SphereGeometry(.13,24,12),mat(0x552536,.6,0));
  mouth.scale.set(1.5,.15,.35);mouth.position.set(0,-.48,.69);head.add(mouth);

  buildHair();
  buildOrnament();
  buildSword();
}

function makeSleeve(side){
  const g=new THREE.Group();g.position.set(side*.72,1.15,0);
  const s=new THREE.Mesh(new THREE.CapsuleGeometry(.33,1.45,8,18),white);
  s.rotation.z=side*-.55;s.scale.set(1,1,.72);g.add(s);
  const cuff=new THREE.Mesh(new THREE.TorusGeometry(.31,.055,10,24),cyan);
  cuff.rotation.y=Math.PI/2;cuff.position.set(side*.46,-.63,0);g.add(cuff);
  return g;
}

function makeEye(x,y,z){
  const group=new THREE.Group();group.position.set(x,y,z);
  const whiteEye=new THREE.Mesh(new THREE.SphereGeometry(.22,32,18),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.3}));
  whiteEye.scale.set(1.35,.62,.32);group.add(whiteEye);
  const pupil=new THREE.Mesh(new THREE.SphereGeometry(.105,24,16),new THREE.MeshStandardMaterial({color:0x61e4ff,emissive:0x27c9ff,emissiveIntensity:2.5,roughness:.2}));
  pupil.position.z=.115;group.add(pupil);
  const irisRing=new THREE.Mesh(new THREE.TorusGeometry(.13,.018,8,24),new THREE.MeshBasicMaterial({color:0x9af0ff}));
  irisRing.position.z=.12;group.add(irisRing);
  const lid=new THREE.Mesh(new THREE.TorusGeometry(.235,.035,8,32,Math.PI),dark);
  lid.rotation.z=Math.PI;lid.position.y=.02;lid.scale.x=1.35;group.add(lid);
  return {group,pupil,white:whiteEye};
}

function buildHair(){
  hairGroup=new THREE.Group();head.add(hairGroup);
  // Back mass
  const back=new THREE.Mesh(new THREE.SphereGeometry(1.08,32,24),dark);
  back.scale.set(1.03,1.18,.62);back.position.set(0,.23,-.24);hairGroup.add(back);
  // Long locks, individually animated
  for(let i=-6;i<=6;i++){
    const lock=new THREE.Mesh(new THREE.CapsuleGeometry(.105,1.9,6,12),dark);
    lock.position.set(i*.13,-.28-.04*Math.abs(i),-.22);
    lock.rotation.z=i*.045;
    lock.userData={base:lock.rotation.z,phase:i*.8};
    hairGroup.add(lock);
  }
  // front bangs
  const bangPositions=[[-.54,.48,.58,-.28],[-.28,.62,.55,-.12],[0,.69,.48,0],[.28,.62,.55,.12],[.54,.48,.58,.28]];
  for(const [x,y,s,r] of bangPositions){
    const b=new THREE.Mesh(new THREE.ConeGeometry(.25,.95,7),dark);
    b.position.set(x,y,.52);b.rotation.z=r;b.scale.set(1.1,1.25,.7);hairGroup.add(b);
  }
  // blue sheen strips
  for(let i=-2;i<=2;i++){
    const shine=new THREE.Mesh(new THREE.CapsuleGeometry(.018,.7,4,8),new THREE.MeshBasicMaterial({color:0x36516e,transparent:true,opacity:.7}));
    shine.position.set(i*.25,.78,.56);shine.rotation.z=i*.08;hairGroup.add(shine);
  }
}

function buildOrnament(){
  const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.12),cyan);gem.position.set(0,1.15,.05);head.add(gem);
  const pin=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.8,8),new THREE.MeshBasicMaterial({color:0xbcefff}));
  pin.position.set(0,1.48,.02);head.add(pin);
}

function buildSword(){
  sword=new THREE.Group();sword.position.set(1.38,1.0,-.2);sword.rotation.z=-.18;avatar.add(sword);
  const blade=new THREE.Mesh(new THREE.BoxGeometry(.075,3.25,.09),new THREE.MeshStandardMaterial({color:0xdffaff,metalness:.8,roughness:.18,emissive:0x35cfff,emissiveIntensity:.7}));
  blade.position.y=1.1;sword.add(blade);
  const edge=new THREE.Mesh(new THREE.BoxGeometry(.018,3.2,.12),new THREE.MeshBasicMaterial({color:0x7de8ff}));
  edge.position.set(.045,1.1,.02);sword.add(edge);
  const guard=new THREE.Mesh(new THREE.TorusGeometry(.23,.045,10,30),cyan);guard.position.y=-.52;guard.rotation.x=Math.PI/2;sword.add(guard);
  const grip=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.62,12),dark);grip.position.y=-.82;sword.add(grip);
}

function buildAura(){
  auraGroup=new THREE.Group();scene.add(auraGroup);
  const ringMat=new THREE.MeshBasicMaterial({color:0x4bdcff,transparent:true,opacity:.14,side:THREE.DoubleSide});
  for(let i=0;i<5;i++){
    const r=new THREE.Mesh(new THREE.TorusGeometry(1.8+i*.38,.012,8,96),ringMat.clone());
    r.position.set(0,1.2-i*.05,-.8);r.rotation.x=Math.PI/2; r.userData.speed=.1+i*.03;auraGroup.add(r);
  }
  const pGeo=new THREE.BufferGeometry(), count=170, pos=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2,rad=2.0+Math.random()*2.6;
    pos[i*3]=Math.cos(a)*rad;pos[i*3+1]=Math.sin(a)*rad*.7+1;pos[i*3+2]=Math.random()*1.8-1;
  }
  pGeo.setAttribute("position",new THREE.BufferAttribute(pos,3));
  auraGroup.add(new THREE.Points(pGeo,new THREE.PointsMaterial({color:0x72e7ff,size:.035,transparent:true,opacity:.75})));
}

function addStars(){
  const g=new THREE.BufferGeometry(),n=500,p=new Float32Array(n*3);
  for(let i=0;i<n;i++){p[i*3]=(Math.random()-.5)*14;p[i*3+1]=(Math.random()-.25)*9;p[i*3+2]=-3-Math.random()*8}
  g.setAttribute("position",new THREE.BufferAttribute(p,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0xbcefff,size:.018,transparent:true,opacity:.6})));
}

function resize(){
  if(!renderer)return;renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
}
addEventListener("resize",resize);

async function setupFace(){
  const fs=await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
  face=await FaceLandmarker.createFromOptions(fs,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"},runningMode:"VIDEO",numFaces:1,outputFaceBlendshapes:true});
}

async function setupMic(){
  try{
    micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    audio=new AC();if(audio.state==="suspended")await audio.resume();
    const src=audio.createMediaStreamSource(micStream);analyser=audio.createAnalyser();analyser.fftSize=256;audioData=new Uint8Array(analyser.fftSize);src.connect(analyser);
  }catch(e){muted=true}
}

function readMic(){
  if(!analyser||muted){T.voice=lerp(T.voice,0,.25);return}
  analyser.getByteTimeDomainData(audioData);let q=0;
  for(const n of audioData){const z=(n-128)/128;q+=z*z}
  T.voice=lerp(T.voice,clamp(Math.sqrt(q/audioData.length)*4,0,1),.25);
}

function track(res){
  const p=res.faceLandmarks?.[0];if(!p)return;
  T.hx=clamp((.5-p[1].x)*1.65,-1,1);
  T.hy=clamp((p[1].y-.47)*1.25,-.8,.8);
  T.hr=clamp(Math.atan2(p[263].y-p[33].y,p[263].x-p[33].x),-.55,.55);
  const b=Object.fromEntries((res.faceBlendshapes?.[0]?.categories||[]).map(v=>[v.categoryName,v.score]));
  T.blink=clamp(((b.eyeBlinkLeft||0)+(b.eyeBlinkRight||0))*.72,0,1);
  T.jaw=clamp((b.jawOpen||0)*1.5,0,1);
  T.gx=clamp(((b.eyeLookOutLeft||0)-(b.eyeLookInLeft||0)+(b.eyeLookInRight||0)-(b.eyeLookOutRight||0))*.7,-1,1);
  T.gy=clamp(((b.eyeLookDownLeft||0)+(b.eyeLookDownRight||0)-(b.eyeLookUpLeft||0)-(b.eyeLookUpRight||0))*.55,-1,1);
}

function update3D(){
  const hx=lerp(0,T.hx,.5),hy=lerp(0,T.hy,.5),hr=lerp(0,T.hr,.5);
  avatar.rotation.y=lerp(avatar.rotation.y,hx*.42,.12);
  avatar.rotation.x=lerp(avatar.rotation.x,hy*.16,.12);
  avatar.rotation.z=lerp(avatar.rotation.z,-hr*.22,.12);
  head.rotation.y=lerp(head.rotation.y,hx*.12,.16);
  head.rotation.x=lerp(head.rotation.x,hy*.07,.16);

  const gazeX=T.gx*.055,gazeY=T.gy*.035;
  pupilL.position.x=lerp(pupilL.position.x,gazeX,.2);pupilR.position.x=lerp(pupilR.position.x,gazeX,.2);
  pupilL.position.y=lerp(pupilL.position.y,gazeY,.2);pupilR.position.y=lerp(pupilR.position.y,gazeY,.2);
  const eyeScale=1-0.86*T.blink;
  eyeL.group.scale.y=eyeScale;eyeR.group.scale.y=eyeScale;

  const open=clamp(T.jaw*.9+T.voice*.65,0,1);
  mouth.scale.y=lerp(mouth.scale.y,.15+open*.9,.3);
  mouth.scale.x=lerp(mouth.scale.x,1.5+open*.45,.3);

  const sway=Math.sin(t*1.6)*.04+T.hx*.07;
  sleeveL.rotation.z=lerp(sleeveL.rotation.z,-.55-sway,.08);
  sleeveR.rotation.z=lerp(sleeveR.rotation.z,.55+sway,.08);
  robe.rotation.y=lerp(robe.rotation.y,sway*.25,.08);

  hairGroup.children.forEach((o,i)=>{if(o.userData.phase!==undefined)o.rotation.z=o.userData.base+Math.sin(t*1.4+o.userData.phase)*.035+T.hx*.025});
  sword.rotation.z=lerp(sword.rotation.z,-.18+hr*.18,.1);

  auraGroup.visible=fx;
  if(fx)auraGroup.children.forEach((o,i)=>{if(o.isMesh&&o.geometry.type==="TorusGeometry")o.rotation.z=t*o.userData.speed});
  camera.position.x=lerp(camera.position.x,hx*.18,.05);
  camera.lookAt(0,1.45,0);
}

function render(){t+=.016;readMic();update3D();renderer.render(scene,camera)}

async function begin(){
  startBtn.disabled=true;msg.textContent="Đang xin quyền Camera…";state.textContent="Đang khởi động…";
  try{
    if(!isSecureContext)throw new Error("HTTPS");
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:720},height:{ideal:1280}},audio:false});
    video.srcObject=stream;await video.play();
    msg.textContent="Camera OK • đang bật microphone…";
    await setupMic();
    try{await setupFace();state.textContent="LỤC TRẦN • 3D LIVE"}catch(e){console.warn(e);state.textContent="LỤC TRẦN • 3D"}
    document.body.classList.add("live");buttons.hidden=false;running=true;requestAnimationFrame(loop);
  }catch(e){
    startBtn.disabled=false;
    const m=e.message==="HTTPS"?"Trang phải chạy bằng HTTPS":e.name==="NotAllowedError"?"Safari chưa cho phép Camera/Microphone":e.name==="NotFoundError"?"Không tìm thấy camera":e.name==="NotReadableError"?"Camera đang bị ứng dụng khác dùng":"Không khởi động được Camera";
    state.textContent=m;msg.textContent=m;alert(m+"\n\nCài đặt → Ứng dụng → Safari → Camera/Microphone → Cho phép, rồi tải lại trang.");
  }
}

function loop(now){
  if(!running)return;
  if(face&&video.readyState>=2&&video.currentTime!==lastTime){try{track(face.detectForVideo(video,now))}catch(e){}lastTime=video.currentTime}
  render();requestAnimationFrame(loop);
}

document.getElementById("reset").onclick=()=>{T.hx=T.hy=T.hr=T.gx=T.gy=0;avatar.rotation.set(0,0,0)};
document.getElementById("mic").onclick=e=>{muted=!muted;e.currentTarget.textContent=muted?"🔇":"🎙";if(micStream)micStream.getAudioTracks().forEach(x=>x.enabled=!muted)};
document.getElementById("mirror").onclick=()=>{mirror=!mirror;canvas.style.transform=mirror?"scaleX(-1)":"none"};
document.getElementById("fx").onclick=e=>{fx=!fx;e.currentTarget.textContent=fx?"✦":"○"};
startBtn.onclick=begin;
init3D();render();
