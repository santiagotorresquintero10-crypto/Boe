/* ═══════════════════════════════════════════════════════════════════════
   DASHBOARD 3D · OFICINA BACK OFFICE EMPRESARIAL (Three.js r160, bajo demanda)
   Maqueta isométrica de la oficina. Se tocan directamente las salas (sin etiquetas
   que tapen la maqueta) y la cámara se acerca a la sala elegida:
     · Sala de espera / Recepción → Clientes
     · Escritorios junto a las pantallas → Facturación
     · Escritorios del centro → Equipo (usuarios)
   Los datos llegan desde script.js (los mismos de Firebase, sin lecturas extra).
═══════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const fmtN = n => Math.round(Number(n)||0).toLocaleString('es-CO');
const fmtM = v => { v = Number(v)||0; const a = Math.abs(v);
  if (a >= 1e9) return '$ ' + (v/1e9).toFixed(1).replace('.',',') + ' mil M';
  if (a >= 1e6) return '$ ' + (v/1e6).toFixed(1).replace('.',',') + ' M';
  return '$ ' + fmtN(v); };
const esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function rebote(x){ const n=7.5625,d=2.75; if(x<1/d) return n*x*x; if(x<2/d) return n*(x-=1.5/d)*x+.75; if(x<2.5/d) return n*(x-=2.25/d)*x+.9375; return n*(x-=2.625/d)*x+.984375; }

/* ── Zonas con datos: nombre, ícono, color, huella en el piso y punto de enfoque ── */
const ZONAS = [
  { k:'clientes',    t:'Clientes',    ic:'fa-user-doctor',  c:'#c2185b', piso:[[-5.6,6.4,0.6,9.9],[6.8,6.9,11.8,9.95]], foco:[[-2.5,1,8.1],[9.3,1.2,8.4]], zoom:1.75 },
  { k:'facturacion', t:'Facturación', ic:'fa-file-invoice', c:'#1757a8', piso:[[-12.9,-8.2,-5.6,5.9]],               foco:[[-9.0,1.2,-1.2]],             zoom:1.45 },
  { k:'equipo',      t:'Equipo',      ic:'fa-users',        c:'#2f9e44', piso:[[-4.4,-1.6,1.3,3.6],[3.2,0.6,8.9,5.5]], foco:[[2.0,1,2.2]],                zoom:1.5 },
];

export async function montar(host, datosIniciales){
  host.innerHTML = `
    <div class="d3-panel">
      <div class="d3-marca"><div class="d3-logo"><i class="fa-solid fa-chart-column"></i></div><div><b>Back Office</b><span>Empresarial</span></div></div>
      <div class="d3-kpis" id="d3Kpis"></div>
      <div class="d3-hora"><span class="d3-vivo"><i></i>EN VIVO</span><small id="d3Hora">—</small></div>
    </div>
    <div class="d3-escena" id="d3Escena">
      <div class="d3-tip" id="d3Tip" hidden></div>
      <div class="d3-ayuda"><i class="fa-solid fa-hand-pointer"></i> Toca la <b>sala de espera</b> (Clientes), los <b>escritorios junto a las pantallas</b> (Facturación) o los <b>del centro</b> (Equipo)</div>
      <div class="d3-tarjeta" id="d3Tarjeta" hidden></div>
    </div>`;
  const escenaEl = host.querySelector('#d3Escena'), tarjetaEl = host.querySelector('#d3Tarjeta'), tipEl = host.querySelector('#d3Tip');
  let datos = datosIniciales;

  /* ── Panel superior ── */
  const kpisEl = host.querySelector('#d3Kpis');
  kpisEl.innerHTML = [['doctores','fa-user-doctor','Clientes (doctores)'],['facturas','fa-file-invoice','Facturas'],['usuarios','fa-users','Equipo (usuarios)']]
    .map(([k,ic,l])=>`<div class="d3-kpi" data-k="${k}"><i class="fa-solid ${ic}"></i><div><b data-n="0">0</b><span>${l}</span></div></div>`).join('');
  function contar(el, valor, sufijo, formato){
    const desde = Number(el.dataset.n)||0, hasta = Math.round(Number(valor)||0);
    const f = formato==='m' ? fmtM : fmtN;
    el.dataset.n = hasta; if (desde===hasta){ el.textContent = f(hasta)+(sufijo||''); return; }
    const t0 = performance.now(), dur = 800;
    const paso = t => { const p = Math.min(1,(t-t0)/dur), e = 1-Math.pow(1-p,3);
      if (String(el.dataset.n)!==String(hasta)) return;
      el.textContent = f(desde+(hasta-desde)*e)+(sufijo||''); if (p<1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }
  function pintarPanel(){
    const f = datos.facturacion || {};
    const v = { doctores:datos.doctores.total, facturas:f.permitido ? f.madres : null, usuarios:datos.equipo.length };
    kpisEl.querySelectorAll('.d3-kpi').forEach(k=>{ const b = k.querySelector('b'); if (v[k.dataset.k]===null){ b.textContent = '—'; b.dataset.n = ''; } else contar(b, v[k.dataset.k]); });
    host.querySelector('#d3Hora').textContent = 'Actualizado ' + new Date(datos.actualizado||Date.now()).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }
  pintarPanel();

  /* ── Renderizador y escena ── */
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:'high-performance' }); }
  catch(e){ throw new Error('WebGL no disponible'); }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  escenaEl.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf7f6f3);
  const cam = new THREE.OrthographicCamera(-1,1,1,-1,-200,300);
  const OBJ = new THREE.Vector3(0, 0.6, 0);
  cam.position.set(30, 27, 30); cam.lookAt(OBJ);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe8dccb, 1.25));
  const sol = new THREE.DirectionalLight(0xfff4e6, 1.9);
  sol.position.set(16, 30, 12); sol.castShadow = true; sol.target.position.set(0,0,0); scene.add(sol.target);
  sol.shadow.mapSize.set(2048,2048); Object.assign(sol.shadow.camera, { left:-20, right:20, top:20, bottom:-20, near:1, far:90 });
  sol.shadow.bias = -0.0004; sol.shadow.normalBias = .02; sol.shadow.radius = 3;
  scene.add(sol);
  const relleno = new THREE.DirectionalLight(0xdfe9ff, .45); relleno.position.set(-20, 14, 6); scene.add(relleno);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.target.copy(OBJ);
  const AZ0 = Math.atan2(30, 30);
  Object.assign(controls, { enablePan:false, enableDamping:true, dampingFactor:.08, minZoom:.75, maxZoom:3.2,
    minPolarAngle:.55, maxPolarAngle:1.12, minAzimuthAngle:AZ0-.75, maxAzimuthAngle:AZ0+.75, rotateSpeed:.6 });
  controls.update();
  let ultimoToque = 0, vaivenActivo = false;
  controls.addEventListener('start', ()=>{ ultimoToque = performance.now(); });
  controls.addEventListener('change', ()=>{ if (!vaivenActivo) ultimoToque = performance.now(); });

  const VISTA = 24;
  function ajustar(){
    const w = escenaEl.clientWidth||1, h = escenaEl.clientHeight||1, a = w/h;
    const v = Math.max(VISTA, 31/a);                // en celular se ve más grande (se puede girar y ampliar)
    cam.left = -v*a/2; cam.right = v*a/2; cam.top = v/2; cam.bottom = -v/2; cam.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  const ro = new ResizeObserver(ajustar); ro.observe(escenaEl); ajustar();

  /* ── Materiales y geometrías compartidas ── */
  const mats = new Map();
  const mat = (color, extra) => { const k = color+'|'+JSON.stringify(extra||{}); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial(Object.assign({ color, roughness:.8, metalness:0 }, extra||{}))); return mats.get(k); };
  const G = {
    caja: new THREE.BoxGeometry(1,1,1), cil: new THREE.CylinderGeometry(.5,.5,1,20), maceta: new THREE.CylinderGeometry(.5,.38,1,18),
    esf: new THREE.SphereGeometry(.5,18,14), cap: new THREE.CapsuleGeometry(.5,1,4,10), plano: new THREE.PlaneGeometry(1,1),
    disco: new THREE.CylinderGeometry(.5,.5,1,32),
  };
  const malla = (geo, m, sx=1, sy=1, sz=1, sombra=true) => { const o = new THREE.Mesh(geo, m); o.scale.set(sx,sy,sz); o.castShadow = sombra; o.receiveShadow = true; return o; };
  const caja = (m, w,h,d, x,y,z, sombra=true) => { const o = malla(G.caja, m, w,h,d, sombra); o.position.set(x,y,z); return o; };
  const vidrio = new THREE.MeshStandardMaterial({ color:0xd6ecf7, transparent:true, opacity:.2, roughness:.05, metalness:.2, depthWrite:false, side:THREE.DoubleSide });
  const M = {
    pared: mat(0xf1ebe3), paredBorde: mat(0xffffff), losa: mat(0xd5d9df), losaBorde: mat(0xb9bfc8),
    madera: mat(0xc49a6c, { roughness:.6 }), maderaOsc: mat(0x9b6b3f, { roughness:.6 }), metal: mat(0x2d3238, { roughness:.4, metalness:.5 }),
    gris: mat(0x9aa3ad), grisClaro: mat(0xdfe3e8), blanco: mat(0xffffff), negro: mat(0x23272d, { roughness:.5 }),
    silla: mat(0x2b2f36, { roughness:.6 }), led: new THREE.MeshBasicMaterial({ color:0xffe2b0 }),
    sofa: mat(0xd8d2c8), cojin: mat(0x3e5c8a), tapete: mat(0x8d9aab),
    papel: mat(0xfafafa), maceta: mat(0x30353c, { roughness:.5 }), tierra: mat(0x4e3b2c),
  };

  /* ── Texturas dibujadas (canvas) ── */
  function lienzo(w, h, dibujar){ const cv = document.createElement('canvas'); cv.width = w; cv.height = h; dibujar(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData.cv = cv; return t; }
  const texPiso = lienzo(256, 256, (c,w,h)=>{ c.fillStyle='#ede7df'; c.fillRect(0,0,w,h);
    for (let i=0;i<2;i++) for (let j=0;j<2;j++){ c.fillStyle = (i+j)%2 ? '#ebe4db' : '#efe9e1'; c.fillRect(i*128+2, j*128+2, 124, 124); }
    c.strokeStyle='#d8d0c4'; c.lineWidth=3; c.strokeRect(0,0,w,h); c.beginPath(); c.moveTo(128,0); c.lineTo(128,256); c.moveTo(0,128); c.lineTo(256,128); c.stroke(); });
  texPiso.wrapS = texPiso.wrapT = THREE.RepeatWrapping; texPiso.repeat.set(13, 10);
  const dibujarLogo = (c, claro) => { c.clearRect(0,0,1024,300);
    [[40,170,46,110],[100,130,46,150],[160,90,46,190],[220,50,46,230]].forEach(([x,y,w,h],i)=>{ c.fillStyle = claro ? '#fff6e8' : ['#1757a8','#1757a8','#0b1f3a','#0b1f3a'][i]; c.fillRect(x,y,w,h); });
    c.fillStyle = claro ? '#fff6e8' : '#0b1f3a'; c.font='800 130px Nunito, Segoe UI, sans-serif'; c.fillText('Back Office', 300, 150);
    c.fillStyle = claro ? '#fff6e8' : '#1757a8'; c.font='600 62px Nunito, Segoe UI, sans-serif';
    let x = 306; for (const ch of 'Empresarial'){ c.fillText(ch, x, 250); x += c.measureText(ch).width + 22; } };
  const texLogo = lienzo(1024, 300, c=>dibujarLogo(c, false)), texLogoClaro = lienzo(1024, 300, c=>dibujarLogo(c, true));
  texLogo.anisotropy = texLogoClaro.anisotropy = 16;
  const texMonitor = [0,1,2].map(v=>lienzo(256, 160, (c,w,h)=>{ c.fillStyle='#eaf2fb'; c.fillRect(0,0,w,h);
    c.fillStyle='#1757a8'; c.fillRect(0,0,w,18); c.fillStyle='#ffffff'; c.fillRect(8,26,70,h-34);
    for (let i=0;i<6;i++){ c.fillStyle = i%2 ? '#c9d9ee' : '#dbe6f3'; c.fillRect(86, 28+i*20, w-96, 12); }
    if (v===1){ c.fillStyle='#2270d4'; [30,55,42,70,62].forEach((b,i)=>c.fillRect(100+i*28, 140-b, 18, b)); }
    if (v===2){ c.strokeStyle='#2f9e44'; c.lineWidth=4; c.beginPath(); [20,40,30,60,52,80].forEach((y,i)=>{ const X=96+i*30, Y=140-y; i?c.lineTo(X,Y):c.moveTo(X,Y); }); c.stroke(); } }));
  const texCuadro = lienzo(320, 220, (c,w,h)=>{ const g = c.createLinearGradient(0,0,0,h); g.addColorStop(0,'#cfe3f2'); g.addColorStop(1,'#f4efe6'); c.fillStyle=g; c.fillRect(0,0,w,h);
    c.fillStyle='#7d93ad'; c.beginPath(); c.moveTo(0,170); c.lineTo(90,70); c.lineTo(170,150); c.lineTo(240,90); c.lineTo(320,160); c.lineTo(320,220); c.lineTo(0,220); c.fill();
    c.fillStyle='#4e6a8a'; c.beginPath(); c.moveTo(0,200); c.lineTo(120,120); c.lineTo(220,190); c.lineTo(320,140); c.lineTo(320,220); c.lineTo(0,220); c.fill(); });
  // Pantallas grandes (Análisis) y tablero Kanban (Gestión): se redibujan con los datos
  const texPantallaA = lienzo(640, 360, ()=>{}), texPantallaB = lienzo(640, 360, ()=>{}), texKanban = lienzo(600, 420, ()=>{});
  function dibujarPantallas(){
    const W=640, H=360, f = datos.facturacion || {};
    let c = texPantallaA.userData.cv.getContext('2d');
    c.fillStyle='#f4f8fd'; c.fillRect(0,0,W,H); c.fillStyle='#0b1f3a'; c.fillRect(0,0,W,42);
    c.fillStyle='#fff'; c.font='700 22px Nunito, sans-serif'; c.fillText('Facturación', 18, 29);
    if (f.permitido){
      const vals = [['Pagadas',f.pagadas,'#2f9e44'],['Pendientes',f.pendientes,'#e8590c'],['Hijas',f.hijas,'#1757a8']], mx = Math.max(1,...vals.map(v=>v[1]));
      vals.forEach(([l,v,col],i)=>{ const bh = 200*v/mx; const x = 70+i*190; c.fillStyle='#e3ebf5'; c.fillRect(x,96,110,200);
        c.fillStyle=col; c.fillRect(x,296-bh,110,bh); c.fillStyle='#0b1f3a'; c.font='800 30px Nunito, sans-serif'; c.fillText(fmtN(v), x+30, Math.max(90, 296-bh-10));
        c.font='600 18px Nunito, sans-serif'; c.fillStyle='#4a5568'; c.fillText(l, x+14, 326); });
      c.fillStyle='#0b1f3a'; c.font='800 22px Nunito, sans-serif'; c.fillText('Facturas madre: '+fmtN(f.madres), 380, 29);
    } else { c.fillStyle='#4a5568'; c.font='700 26px Nunito, sans-serif'; c.fillText('Back Office Empresarial', 150, 200); }
    texPantallaA.needsUpdate = true;
    c = texPantallaB.userData.cv.getContext('2d');
    c.fillStyle='#163a6e'; c.fillRect(0,0,W,H); c.fillStyle='#0b1f3a'; c.fillRect(0,0,W,42);
    c.fillStyle='#fff'; c.font='700 22px Nunito, sans-serif'; c.fillText('Clientes y equipo', 18, 29);
    const tarjetaP = (x, titulo, n, sub) => { c.fillStyle='rgba(255,255,255,.08)'; c.fillRect(x, 70, 280, 250);
      c.fillStyle='#9ec5ff'; c.font='700 22px Nunito, sans-serif'; c.fillText(titulo, x+22, 112);
      c.fillStyle='#ffffff'; c.font='800 92px Nunito, sans-serif'; c.fillText(fmtN(n), x+22, 220);
      c.fillStyle='#cfe3ff'; c.font='600 20px Nunito, sans-serif'; c.fillText(sub, x+22, 280); };
    tarjetaP(24, 'Doctores', datos.doctores.total, fmtN(datos.doctores.activos)+' activos');
    tarjetaP(336, 'Usuarios', datos.equipo.length, 'en el equipo');
    texPantallaB.needsUpdate = true;
  }
  (()=>{ const c = texKanban.userData.cv.getContext('2d');                 // tablero de pared decorativo
    c.fillStyle='#ffffff'; c.fillRect(0,0,600,420); c.fillStyle='#0b1f3a'; c.font='800 26px Nunito, sans-serif'; c.fillText('Planeación', 20, 38);
    ['#ffd8a8','#ffec99','#b2f2bb'].forEach((f,i)=>{ const x = 20+i*192; c.fillStyle='#f1f3f5'; c.fillRect(x,56,180,350);
      for (let k=0;k<[5,4,6][i];k++){ c.fillStyle=f; c.fillRect(x+10+(k%2)*84, 74+Math.floor(k/2)*72, 76, 60); } });
    texKanban.needsUpdate = true; })();
  dibujarPantallas();

  /* ── Animación de entrada ── */
  const entradas = []; const T0 = performance.now() + 150;
  function entrar(obj, orden, tipo='caer'){
    obj.userData.yBase = obj.position.y; obj.userData.sBase = obj.scale.clone();
    entradas.push({ obj, t0: T0 + orden*90, tipo }); obj.visible = false;
  }

  /* ── Grupos por zona (para resaltar y tocar) ── */
  const mundo = new THREE.Group(); scene.add(mundo);
  const zonaG = {}; ZONAS.forEach(z=>{ zonaG[z.k] = new THREE.Group(); zonaG[z.k].userData.zona = z.k; mundo.add(zonaG[z.k]); });
  const deco = new THREE.Group(); mundo.add(deco);
  // Áreas de la maqueta → zona con datos (o solo decoración)
  const Z = { analisis:zonaG.facturacion, facturacion:zonaG.facturacion, conciliaciones:zonaG.equipo, soporte:zonaG.equipo,
              clientes:zonaG.clientes, gestion:deco, reuniones:deco, archivo:deco };

  /* Losa, piso y paredes en corte */
  const losa = caja(M.losa, 27.4, .6, 21.4, 0, -.3, 0); losa.castShadow = false; deco.add(losa);
  deco.add(caja(M.losaBorde, 27.6, .2, 21.6, 0, -.68, 0, false));
  const piso = new THREE.Mesh(G.plano, new THREE.MeshStandardMaterial({ map:texPiso, roughness:.65 }));
  piso.rotation.x = -Math.PI/2; piso.scale.set(26, 20, 1); piso.position.y = .005; piso.receiveShadow = true; deco.add(piso);
  const ALTO = 4.2;
  const paredes = new THREE.Group(); deco.add(paredes);
  paredes.add(caja(M.pared, .35, ALTO, 20.35, -13.15, ALTO/2, .17));            // izquierda (fondo)
  paredes.add(caja(M.pared, 26.3, ALTO, .35, .15, ALTO/2, -10.15));             // fondo
  paredes.add(caja(M.paredBorde, .5, .18, 20.5, -13.15, ALTO+.09, .17, false));
  paredes.add(caja(M.paredBorde, 26.5, .18, .5, .15, ALTO+.09, -10.15, false));
  paredes.add(caja(M.led, .06, .06, 20, -12.95, ALTO-.12, .1, false));          // tira de luz cálida
  paredes.add(caja(M.led, 25.8, .06, .06, .1, ALTO-.12, -9.95, false));
  // muretes bajos al frente con vidrio
  const murete = (x,z,w,d,h=.55) => paredes.add(caja(M.paredBorde, w, h, d, x, h/2, z));
  murete(-9.3, 9.95, 7.4, .25); murete(3.9, 9.95, 6.2, .25); murete(12.95, -5.3, .25, 9.4); murete(12.95, 3.3, .25, 4.6);
  const panelVidrio = (x,z,w,d,h) => { const v = new THREE.Mesh(G.caja, vidrio); v.scale.set(w,h,d); v.position.set(x, .55+h/2, z); paredes.add(v);
    paredes.add(caja(M.metal, Math.max(w,.06), .05, Math.max(d,.06), x, .55+h, z, false)); };
  panelVidrio(-9.3, 9.95, 7.4, .04, 1.5); panelVidrio(12.95, 3.3, .04, 4.6, 1.5);
  for (let x=-12.9; x<=-5.7; x+=1.8) paredes.add(caja(M.metal, .05, 1.5, .06, x, 1.3, 9.95, false));

  /* Plantas */
  const hojaGeo = (()=>{ const s = new THREE.Shape(); s.moveTo(0,0); s.quadraticCurveTo(.16,.35,0,1); s.quadraticCurveTo(-.16,.35,0,0); return new THREE.ShapeGeometry(s, 6); })();
  const verdes = [0x3f8f3a, 0x4fa047, 0x5bb050, 0x377d33].map(c=>new THREE.MeshStandardMaterial({ color:c, roughness:.7, side:THREE.DoubleSide }));
  function planta(x, z, s=1, alta=false, conMaceta=true){
    const g = new THREE.Group();
    if (conMaceta){ const m = malla(G.maceta, M.maceta, .7*s, .75*s, .7*s); m.position.y = .375*s; g.add(m);
      const t = malla(G.disco, M.tierra, .6*s, .04, .6*s, false); t.position.y = .74*s; g.add(t); }
    const n = alta ? 16 : 12, base = conMaceta ? .76*s : 0;
    for (let i=0;i<n;i++){ const h = new THREE.Mesh(hojaGeo, verdes[i%4]); h.castShadow = true;
      const L = (alta ? 1.7 : 1.15) * s * (.75 + .5*((i*37)%10)/10);
      h.scale.set(L*.9, L, 1); h.position.y = base;
      h.rotation.order = 'YXZ'; h.rotation.y = i*2.39; h.rotation.x = -(.25 + .5*((i*53)%10)/10); g.add(h); }
    g.position.set(x, 0, z); return g;
  }
  const jardinera = (w,d) => { const g = new THREE.Group(); g.add(caja(M.maceta, w, .55, d, 0, .275, 0));
    const n = Math.max(3, Math.round(w*d*2.2));
    for (let i=0;i<n;i++){ const p = planta(((i+.5)/n-.5)*(w-.4), ((i*7)%3-1)*(d-.4)/3, .55, false, false); p.position.y = .55; g.add(p); }
    return g; };

  /* Personas */
  const pieles = [0xf1c9a5, 0xe0ac69, 0xc68642, 0x8d5524, 0xf6d7b8];
  const pelos = [0x2b1d16, 0x4a2f1f, 0x111111, 0x6b4a2b, 0x2e2e2e];
  const camisas = [0xffffff, 0xd6e4f5, 0x1f2d44, 0xe8ecef, 0x2b2f36, 0xf4f1ec, 0x3d5a80];
  const pantalones = [0x1f2933, 0x2d3748, 0x3b4252, 0x22313f];
  const animados = [];
  let semilla = 7; const azar = () => (semilla = (semilla*9301+49297)%233280)/233280;
  function persona(pose, opts={}){
    const g = new THREE.Group();
    const piel = mat(pieles[opts.piel ?? Math.floor(azar()*5)]), pelo = mat(pelos[opts.pelo ?? Math.floor(azar()*5)]);
    const camisa = mat(camisas[opts.camisa ?? Math.floor(azar()*camisas.length)]), pant = mat(pantalones[Math.floor(azar()*4)]);
    const largo = opts.largo ?? azar() > .5;
    const torsoY = pose==='sentado' ? .98 : 1.22, cabezaY = torsoY + .5;
    if (pose==='sentado'){
      [-.1,.1].forEach(dx=>{ g.add(caja(pant, .17, .15, .5, dx, .55, .2)); g.add(caja(pant, .15, .5, .15, dx, .28, .43)); g.add(caja(M.negro, .16, .07, .24, dx, .035, .5)); });
    } else {
      g.userData.piernas = [-.1,.1].map(dx=>{ const pg = new THREE.Group(); pg.position.set(dx, .86, 0);
        pg.add(caja(pant, .17, .86, .19, 0, -.43, 0)); pg.add(caja(M.negro, .17, .08, .26, 0, -.83, .04)); g.add(pg); return pg; });
    }
    const torso = malla(G.cap, camisa, .44, .3, .3); torso.position.y = torsoY; g.add(torso);
    const brazos = [-1,1].map(lado=>{ const bg = new THREE.Group(); bg.position.set(lado*.27, torsoY+.2, 0);
      const b = malla(G.cap, camisa, .13, .32, .13); b.position.y = -.22; bg.add(b);
      const mano = malla(G.esf, piel, .11, .11, .11); mano.position.y = -.47; bg.add(mano);
      if (pose==='sentado') bg.rotation.x = -1.15; g.add(bg); return bg; });
    const cuello = malla(G.cil, piel, .12, .12, .12); cuello.position.y = torsoY+.33; g.add(cuello);
    const cabeza = new THREE.Group(); cabeza.position.y = cabezaY; g.add(cabeza);
    cabeza.add(malla(G.esf, piel, .32, .36, .32));
    const pl = malla(G.esf, pelo, .345, .3, .345); pl.position.set(0,.07,-.03); cabeza.add(pl);
    if (largo) cabeza.add(caja(pelo, .3, .42, .1, 0, -.12, -.15));
    Object.assign(g.userData, { pose, brazos, cabeza, fase: azar()*6 });
    animados.push(g);
    return g;
  }

  /* Muebles */
  function silla(){ const g = new THREE.Group();
    g.add(caja(M.silla, .52, .09, .5, 0, .46, 0)); g.add(caja(M.silla, .5, .62, .08, 0, .82, -.24));
    const p = malla(G.cil, M.metal, .06, .4, .06); p.position.y = .24; g.add(p);
    const b = malla(G.disco, M.metal, .5, .04, .5); b.position.y = .03; g.add(b); return g; }
  function puesto(ocupado, monitor=0, opts={}){
    const g = new THREE.Group();
    g.add(caja(M.madera, 1.7, .07, .85, 0, .76, .72));                    // escritorio
    g.add(caja(mat(0xd9c6a6), .5, .72, .78, .55, .36, .72));              // cajonera
    g.add(caja(M.metal, .05, .72, .78, -.8, .36, .72));
    const mon = new THREE.Group(); mon.position.set(-.1, .79, .98);
    mon.add(caja(M.negro, .08, .3, .08, 0, .15, 0)); mon.add(caja(M.negro, .3, .03, .2, 0, .015, 0));
    mon.add(caja(M.negro, .78, .48, .04, 0, .5, 0));
    const pant = new THREE.Mesh(G.plano, new THREE.MeshBasicMaterial({ map:texMonitor[monitor%3], toneMapped:false }));
    pant.scale.set(.72, .42, 1); pant.position.set(0,.5,-.025); pant.rotation.y = Math.PI; mon.add(pant);
    g.add(mon);
    g.add(caja(M.negro, .5, .025, .17, -.1, .81, .55, false));            // teclado
    g.add(caja(M.papel, .3, .05, .38, .55, .82, .7, false));               // papeles
    if (opts.carpetas) for (let i=0;i<3;i++) g.add(caja(mat([0x1f2d44,0x8a94a6,0x3d5a80][i]), .34, .07, .26, .58, .86+i*.075, .92, false));
    const s = silla(); s.position.z = .05; g.add(s);
    if (ocupado){ const p = persona('sentado'); p.position.z = .05; g.add(p); }
    return g;
  }
  function grupoPuestos(cx, cz, ocupados, mon0=0){
    const g = new THREE.Group();
    [[-.88,-1.45,0],[.88,-1.45,0],[-.88,1.45,Math.PI],[.88,1.45,Math.PI]].forEach(([x,z,r],i)=>{
      const p = puesto(ocupados[i], i+mon0, { carpetas: i%2===0 }); p.position.set(x,0,z); p.rotation.y = r; g.add(p); });
    g.add(caja(mat(0xe5e9ee), 3.5, .32, .05, 0, .97, 0));                  // divisor
    g.position.set(cx, 0, cz); return g;
  }

  let orden = 0;
  /* ══ ANÁLISIS Y REPORTES: pantallas en la pared + puestos ══ */
  (()=>{ const z = Z.analisis;
    const marco = (zc, tex) => { const gm = new THREE.Group(); gm.add(caja(M.negro, .12, 1.95, 3.25, 0, 0, 0));
      const pl = new THREE.Mesh(G.plano, new THREE.MeshBasicMaterial({ map:tex, toneMapped:false })); pl.scale.set(3.1, 1.75, 1); pl.position.x = .07; pl.rotation.y = Math.PI/2; gm.add(pl);
      gm.position.set(-12.9, 2.25, zc); return gm; };
    const p1 = marco(-6.15, texPantallaA), p2 = marco(-2.75, texPantallaB); z.add(p1, p2); entrar(p1, orden++, 'crecer'); entrar(p2, orden++, 'crecer');
    const gp = grupoPuestos(-8.4, -4.3, [true,true,true,false], 0); z.add(gp); entrar(gp, orden++);
    const pl = planta(-12.1, -0.9, 1.1, true); z.add(pl); entrar(pl, orden++);
  })();
  /* Logo de marca en la pared izquierda */
  const logo = new THREE.Mesh(G.plano, new THREE.MeshBasicMaterial({ map:texLogo, transparent:true, toneMapped:false }));
  logo.scale.set(6.8, 2.0, 1); logo.rotation.y = Math.PI/2; logo.position.set(-12.94, 3.15, 2.8); deco.add(logo); entrar(logo, orden++, 'crecer');
  const luzLogo = caja(M.led, .05, .04, 6.6, -12.93, 4.12, 2.8, false); deco.add(luzLogo);       // luz cálida sobre el letrero
  /* ══ FACTURACIÓN ══ */
  (()=>{ const z = Z.facturacion;
    const gp = grupoPuestos(-8.4, 3.45, [true,false,true,true], 1); z.add(gp); entrar(gp, orden++);
    const imp = new THREE.Group(); imp.add(caja(M.grisClaro, .9, .9, .7, 0, .45, 0)); imp.add(caja(M.negro, .92, .14, .72, 0, .97, 0)); imp.add(caja(M.papel, .5, .03, .35, 0, 1.05, .05, false));
    imp.position.set(-12.2, 0, 4.9); z.add(imp); entrar(imp, orden++);
  })();
  /* ══ GESTIÓN Y CONTROL: tablero Kanban + persona revisando ══ */
  (()=>{ const z = Z.gestion;
    const tb = new THREE.Group(); tb.add(caja(M.metal, .1, 2.3, 3.3, 0, 0, 0));
    const pl = new THREE.Mesh(G.plano, new THREE.MeshBasicMaterial({ map:texKanban, toneMapped:false })); pl.scale.set(3.1, 2.1, 1); pl.position.x = .06; pl.rotation.y = Math.PI/2; tb.add(pl);
    tb.position.set(-12.9, 2.05, 7.9); z.add(tb); entrar(tb, orden++, 'crecer');
    const p = persona('pie', { camisa:1 }); p.position.set(-11.4, 0, 7.7); p.rotation.y = -Math.PI/2; p.userData.gesto = true; z.add(p); entrar(p, orden++);
    const pl2 = planta(-12.2, 9.3, 1); z.add(pl2); entrar(pl2, orden++);
  })();
  /* ══ CONCILIACIONES ══ */
  (()=>{ const z = Z.conciliaciones;
    const gp = grupoPuestos(-1.6, 1.0, [true,true,false,true], 2); z.add(gp); entrar(gp, orden++);
    const pl = planta(1.0, -0.9, .8); z.add(pl); entrar(pl, orden++);
  })();
  /* ══ SOPORTE ADMINISTRATIVO ══ */
  (()=>{ const z = Z.soporte;
    const gp = grupoPuestos(6.0, 3.0, [true,true,true,true], 1); z.add(gp); entrar(gp, orden++);
    const pl = planta(8.6, 5.3, .8); z.add(pl); entrar(pl, orden++);
  })();
  /* ══ REUNIONES: sala de vidrio con listones de madera ══ */
  (()=>{ const z = Z.reuniones;
    const sala = new THREE.Group(); z.add(sala);
    for (let x=.8; x<=7.8; x+=.22) sala.add(caja(M.maderaOsc, .12, ALTO-.2, .1, x, (ALTO-.2)/2, -9.88, false));
    // Cuadro del Sagrado Corazón de Jesús con marco dorado y luz de cuadro
    const texJesus = new THREE.TextureLoader().load('img/sagrado-corazon.jpg?v=1'); texJesus.colorSpace = THREE.SRGBColorSpace; texJesus.anisotropy = 8;
    const marcoOro = mat(0xc9a227, { metalness:.55, roughness:.35 });
    sala.add(caja(marcoOro, 2.0, 2.5, .08, 5.6, 2.3, -9.8, false));
    sala.add(caja(mat(0xf6efe0), 1.82, 2.3, .02, 5.6, 2.3, -9.755, false));
    const cuadro = new THREE.Mesh(G.plano, new THREE.MeshBasicMaterial({ map:texJesus, toneMapped:false })); cuadro.scale.set(1.68, 2.13, 1); cuadro.position.set(5.6, 2.3, -9.74); sala.add(cuadro);
    sala.add(caja(marcoOro, 1.0, .05, .1, 5.6, 3.65, -9.7, false)); sala.add(caja(M.led, .9, .02, .04, 5.6, 3.62, -9.66, false));
    const vidrioF = new THREE.Mesh(G.caja, vidrio); vidrioF.scale.set(7.4, ALTO-.3, .05); vidrioF.position.set(4.3, (ALTO-.3)/2, -4.3); sala.add(vidrioF);
    const vidrioL = new THREE.Mesh(G.caja, vidrio); vidrioL.scale.set(.05, ALTO-.3, 5.6); vidrioL.position.set(.6, (ALTO-.3)/2, -7.1); sala.add(vidrioL);
    for (let x=.6; x<=8; x+=1.85) sala.add(caja(M.metal, .07, ALTO-.3, .07, x, (ALTO-.3)/2, -4.3, false));
    for (let zz=-9.9; zz<=-4.3; zz+=1.4) sala.add(caja(M.metal, .07, ALTO-.3, .07, .6, (ALTO-.3)/2, zz, false));
    sala.add(caja(M.metal, 7.45, .07, .07, 4.3, ALTO-.3, -4.3, false)); sala.add(caja(M.metal, .07, .07, 5.6, .6, ALTO-.3, -7.1, false));
    const mesa = new THREE.Group(); mesa.add(caja(M.madera, 3.6, .09, 1.5, 0, .76, 0)); mesa.add(caja(M.metal, .1, .72, 1.1, -1.4, .36, 0)); mesa.add(caja(M.metal, .1, .72, 1.1, 1.4, .36, 0));
    mesa.add(caja(M.grisClaro, .5, .03, .35, -.6, .82, .2, false)); mesa.add(caja(M.negro, .45, .03, .32, .7, .82, -.2, false));
    mesa.position.set(4.3, 0, -7.1); z.add(mesa); entrar(mesa, orden++);
    [[-1.1,-1.1,0,true],[0,-1.1,0,false],[1.1,-1.1,0,true],[-1.1,1.1,Math.PI,true],[0,1.1,Math.PI,true],[1.1,1.1,Math.PI,false]].forEach(([dx,dz,r,ocupado])=>{
      const g = new THREE.Group(); g.add(silla()); if (ocupado){ const p = persona('sentado'); p.userData.reunion = true; g.add(p); }
      g.position.set(4.3+dx, 0, -7.1+dz); g.rotation.y = r; z.add(g); entrar(g, orden++); });
    const lampara = new THREE.Group(); lampara.add(caja(M.metal, .02, 1.3, .02, 0, ALTO-.95, 0, false));
    const pantalla = malla(new THREE.ConeGeometry(.45,.35,24,1,true), M.negro, 1,1,1, false); pantalla.position.y = ALTO-1.75; lampara.add(pantalla);
    const foco = malla(G.esf, new THREE.MeshBasicMaterial({ color:0xfff1c9 }), .2,.2,.2, false); foco.position.y = ALTO-1.88; lampara.add(foco);
    lampara.position.set(4.3, 0, -7.1); z.add(lampara);
    const pl = planta(1.4, -9.1, .9, true); z.add(pl); entrar(pl, orden++);   // en la esquina, sin tapar el cuadro
  })();
  /* ══ ARCHIVO Y DOCUMENTACIÓN: estanterías con carpetas, fotocopiadora, reloj ══ */
  let manecillas = null;
  (()=>{ const z = Z.archivo;
    const est = (x0, z0, girar) => { const g = new THREE.Group();
      [0, .75, 1.5, 2.25, 3.0].forEach(y=>g.add(caja(M.metal, 3.2, .05, .6, 0, y+.02, 0)));
      [-1.58,1.58].forEach(x=>g.add(caja(M.metal, .05, 3.05, .6, x, 1.52, 0)));
      const cols = [0x1f2d44, 0xf2f2f2, 0x8a94a6, 0x3d5a80, 0xdfe3e8];
      const n = 4*17; const inst = new THREE.InstancedMesh(G.caja, M.blanco, n); inst.castShadow = true; let k = 0; const m4 = new THREE.Matrix4(), col = new THREE.Color();
      for (let r=0;r<4;r++) for (let i=0;i<17;i++){ const h = .55 + ((i*7+r)%4)*.03;
        m4.compose(new THREE.Vector3(-1.45 + i*.18, .05 + r*.75 + h/2, .02), new THREE.Quaternion(), new THREE.Vector3(.14, h, .5));
        inst.setMatrixAt(k, m4); inst.setColorAt(k, col.setHex(cols[(i+r*3)%5])); k++; }
      g.add(inst); g.position.set(x0, 0, z0); if (girar) g.rotation.y = girar; return g; };
    const e1 = est(11.1, -9.6, 0); z.add(e1); entrar(e1, orden++);
    const e2 = est(12.6, -6.4, -Math.PI/2); z.add(e2); entrar(e2, orden++);
    const cop = new THREE.Group(); cop.add(caja(M.grisClaro, 1.1, 1.0, .85, 0, .5, 0)); cop.add(caja(M.blanco, 1.1, .25, .85, 0, 1.12, 0)); cop.add(caja(M.negro, 1.0, .1, .7, 0, 1.3, 0));
    cop.add(caja(M.gris, .5, .04, .3, .2, .8, .45)); cop.position.set(11.9, 0, -2.6); cop.rotation.y = -Math.PI/2; z.add(cop); entrar(cop, orden++);
    const p = persona('pie', { camisa:0, largo:true }); p.position.set(10.9, 0, -2.6); p.rotation.y = Math.PI/2; p.userData.gesto = true; z.add(p); entrar(p, orden++);
    const archivador = new THREE.Group(); [0,1,2].forEach(i=>{ archivador.add(caja(M.grisClaro, .8, .42, .7, 0, .22+i*.44, 0)); archivador.add(caja(M.gris, .3, .04, .03, 0, .3+i*.44, .36, false)); });
    archivador.position.set(9.6, 0, -9.3); z.add(archivador); entrar(archivador, orden++);
    const reloj = new THREE.Group(); const cara = malla(G.disco, M.blanco, .9, .06, .9, false); cara.rotation.x = Math.PI/2; reloj.add(cara);
    reloj.add(malla(new THREE.TorusGeometry(.45,.04,8,32), M.negro, 1,1,1, false));
    const ph = new THREE.Group(); ph.add(caja(M.negro, .04, .24, .02, 0, .1, .05, false));
    const pm = new THREE.Group(); pm.add(caja(M.negro, .03, .36, .02, 0, .16, .06, false));
    reloj.add(ph, pm); manecillas = { ph, pm };
    reloj.position.set(9.4, 3.3, -9.9); z.add(reloj);
    const pl = planta(9.4, -1.0, .9); z.add(pl); entrar(pl, orden++);
  })();
  /* ══ CLIENTES: sala de espera y recepción con logo en madera ══ */
  (()=>{ const z = Z.clientes;
    const sala = new THREE.Group(); sala.position.set(-2.5, 0, 8.1); z.add(sala);
    sala.add(caja(M.tapete, 4.2, .02, 2.6, 0, .01, 0, false));
    const sofa = new THREE.Group(); sofa.add(caja(M.sofa, 2.6, .42, .9, 0, .3, 0)); sofa.add(caja(M.sofa, 2.6, .6, .25, 0, .7, -.33)); sofa.add(caja(M.sofa, .25, .5, .9, -1.3, .45, 0)); sofa.add(caja(M.sofa, .25, .5, .9, 1.3, .45, 0));
    sofa.add(caja(M.cojin, .5, .4, .14, -.7, .72, -.18)); sofa.add(caja(mat(0xe8e2d8), .5, .4, .14, .7, .72, -.18));
    sofa.position.set(0, 0, .8); sofa.rotation.y = Math.PI; sala.add(sofa);
    const mesa = new THREE.Group(); const t = malla(G.disco, M.madera, 1.2, .07, 1.2); t.position.y = .45; mesa.add(t); const pata = malla(G.cil, M.metal, .1, .42, .1); pata.position.y = .21; mesa.add(pata);
    mesa.add(caja(M.papel, .3, .03, .22, .1, .5, 0, false)); mesa.position.set(0, 0, -.5); sala.add(mesa);
    [-.65,.65].forEach((dx,i)=>{ const p = persona('sentado', { camisa: i ? 2 : 6 }); p.position.set(dx, -.05, .85); p.rotation.y = Math.PI; sala.add(p); });
    entrar(sala, orden++);
    const pl1 = planta(-5.1, 9.3, 1, true); z.add(pl1); entrar(pl1, orden++);
    const rec = new THREE.Group(); rec.position.set(9.3, 0, 8.6); z.add(rec);
    rec.add(caja(M.madera, 4.2, 2.3, .55, 0, 1.15, 0));
    for (let x=-2; x<=2.01; x+=.21) rec.add(caja(M.maderaOsc, .07, 2.2, .04, x, 1.12, .3, false));
    rec.add(caja(M.led, 4.1, .05, .05, 0, .05, .3, false));
    const lg = new THREE.Mesh(G.plano, new THREE.MeshBasicMaterial({ map:texLogoClaro, transparent:true, toneMapped:false })); lg.scale.set(3.7, 1.09, 1); lg.position.set(0, 1.4, .33); rec.add(lg);
    const jd = jardinera(4.2, .55); jd.position.set(0, 2.3, 0); rec.add(jd);
    entrar(rec, orden++);
    deco.add(caja(mat(0x1f3b63), 2.0, .03, 1.2, 11.6, .02, 10.6, false));   // tapete de entrada
    const pl2 = planta(12.2, 6.4, 1.1, true); z.add(pl2); entrar(pl2, orden++);
  })();
  /* Plantas decorativas y jardinera del frente */
  [[-5.4,-0.8,.9,false],[2.2,5.6,.8,false],[12.2,-0.2,.9,true]].forEach(([x,z,s,a])=>{ const p = planta(x,z,s,a); deco.add(p); entrar(p, orden++); });
  const jf = jardinera(.9, 2.6); jf.position.set(12.3, 0, 2.2); deco.add(jf); entrar(jf, orden++);

  /* Persona que camina con documentos (recorre la oficina) */
  const ruta = [[10.0,-1.4],[2.6,-1.9],[-4.6,-1.9],[-4.6,5.6],[2.4,5.8],[2.4,-1.4]].map(([x,z])=>new THREE.Vector3(x,0,z));
  const caminante = persona('pie', { camisa:4 }); caminante.userData.ruta = { i:0, u:0 };
  caminante.add(caja(M.papel, .32, .06, .42, .18, 1.05, .25, false));
  caminante.position.copy(ruta[0]); deco.add(caminante); entrar(caminante, orden++);

  /* ── Resaltado de zona en el piso ── */
  const texResalte = lienzo(256, 256, (c,w,h)=>{ const r = 36; c.clearRect(0,0,w,h);
    c.fillStyle = 'rgba(255,255,255,.55)'; c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 14;
    c.beginPath(); c.moveTo(r,8); c.lineTo(w-r,8); c.quadraticCurveTo(w-8,8,w-8,r); c.lineTo(w-8,h-r); c.quadraticCurveTo(w-8,h-8,w-r,h-8); c.lineTo(r,h-8); c.quadraticCurveTo(8,h-8,8,h-r); c.lineTo(8,r); c.quadraticCurveTo(8,8,r,8); c.closePath(); c.fill(); c.stroke(); });
  const resaltes = {};
  ZONAS.forEach(z=>{ resaltes[z.k] = z.piso.map(([x0,z0,x1,z1])=>{
    const m = new THREE.Mesh(G.plano, new THREE.MeshBasicMaterial({ map:texResalte, color:new THREE.Color(z.c), transparent:true, opacity:0, depthWrite:false }));
    m.rotation.x = -Math.PI/2; m.scale.set(x1-x0, z1-z0, 1); m.position.set((x0+x1)/2, .02, (z0+z1)/2); m.renderOrder = 1; m.visible = false; scene.add(m); return m; }); });

  let sel = null, hoverZona = null, focoActual = null;
  let animCam = null;                                         // { t0, desde, hasta, z0, z1 }
  const HOME = OBJ.clone();
  function moverCamara(hacia, zoom){
    animCam = { t0: performance.now(), desde: controls.target.clone(), hasta: hacia.clone(), z0: cam.zoom, z1: zoom };
  }

  /* ── Tarjetas por zona ── */
  function tarjeta(k){
    const d = datos, z = ZONAS.find(x=>x.k===k); if (!z) return null;
    const lista = (tit, items) => items.length ? '<div class="d3-t-lista"><span>'+esc(tit)+'</span>'+items.map(x=>'<div>'+x+'</div>').join('')+'</div>' : '';
    if (k==='clientes') return { t:'Clientes', s:'Doctores registrados', c:z.c, ic:z.ic, m:[
      ['Doctores', d.doctores.total, '', 'Clientes registrados'], ['Activos', d.doctores.activos, '', 'Estado Activo'],
      ['Inactivos', d.doctores.inactivos, '', 'Estado Inactivo'], ['Especialidades', d.especialidadesTotal, '', 'Distintas'] ],
      x: lista('Principales especialidades', d.especialidades.filter(e=>e.clave!=='sin especialidad').slice(0,3).map(e=>esc(e.nombre)+' · <b>'+e.total+'</b>')) };
    if (k==='facturacion'){ const f = d.facturacion;
      if (!f || !f.permitido) return { t:'Facturación', s:'Sin acceso', c:z.c, ic:z.ic, m:[], x:'<div class="d3-t-nota">No tienes permiso para ver la facturación.</div>' };
      return { t:'Facturación', s:'Facturas UROEXPERTOS', c:z.c, ic:z.ic, m:[
        ['Facturas madre', f.madres, '', 'Facturas registradas'], ['Facturas hijas', f.hijas, '', 'De los especialistas'],
        ['Pagadas', f.pagadas, '', 'Con fecha de pago'], ['Pendientes de pago', f.pendientes, '', 'Sin fecha de pago', f.pendientes>0],
        ['Valor pendiente', f.valorPendiente, '', 'Valor especialista por pagar', false, 'm'] ] }; }
    if (k==='equipo'){ const roles = {}; d.equipo.forEach(m=>{ const r = m.rol || 'Usuario'; roles[r] = (roles[r]||0)+1; });
      return { t:'Equipo', s:'Usuarios de la aplicación', c:z.c, ic:z.ic, m:[
        ['Usuarios', d.equipo.length, '', 'Cuentas registradas'],
        ...Object.entries(roles).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([r,n])=>[r, n, '', 'Rol']) ],
        x: lista('Integrantes', d.equipo.slice(0,8).map(m=>'<i class="d3-t-av" style="background:'+esc(m.color)+'">'+esc(m.ini)+'</i> '+esc(m.nombre))) }; }
    return null;
  }
  function pintarTarjeta(nueva){
    if (!sel) return; const T = tarjeta(sel); if (!T) { cerrar(); return; }
    if (nueva || tarjetaEl.dataset.k !== sel){
      tarjetaEl.dataset.k = sel; tarjetaEl.style.setProperty('--d3c', T.c);
      tarjetaEl.innerHTML = '<button class="d3-t-x" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button>'
        + '<div class="d3-t-cab"><span class="d3-t-ic"><i class="fa-solid '+T.ic+'"></i></span><b>'+esc(T.t)+'</b><span class="d3-vivo"><i></i>EN VIVO</span></div><div class="d3-t-sub">'+esc(T.s)+'</div>'
        + '<div class="d3-t-met">'+T.m.map((x,i)=>'<div class="d3-t-fila" data-i="'+i+'"><div><span>'+esc(x[0])+'</span><small>'+esc(x[3])+'</small></div><b data-n="0">0</b></div>').join('')+'</div>'
        + '<div class="d3-t-extra">'+(T.x||'')+'</div>';
      tarjetaEl.querySelector('.d3-t-x').onclick = ev => { ev.stopPropagation(); cerrar(); };
    } else { const ex = tarjetaEl.querySelector('.d3-t-extra'); if (ex) ex.innerHTML = T.x||''; }
    T.m.forEach((x,i)=>{ const f = tarjetaEl.querySelector('.d3-t-fila[data-i="'+i+'"]'); if (!f) return; f.classList.toggle('alerta', !!x[4]); contar(f.querySelector('b'), x[1], x[2], x[5]); });
    tarjetaEl.hidden = false;
  }
  function abrir(k, punto){
    const z = ZONAS.find(x=>x.k===k); if (!z) return;
    let f = z.foco[0];
    if (punto && z.foco.length > 1){ let mejor = 1e9; z.foco.forEach(c=>{ const dd = Math.hypot(c[0]-punto.x, c[2]-punto.z); if (dd < mejor){ mejor = dd; f = c; } }); }
    sel = k; focoActual = new THREE.Vector3(...f); ultimoToque = performance.now();
    moverCamara(focoActual, escenaEl.clientWidth < 640 ? z.zoom*1.25 : z.zoom);
    tipEl.hidden = true; pintarTarjeta(true); ubicarTarjeta();
  }
  function cerrar(){ if (!sel) return; sel = null; focoActual = null; tarjetaEl.hidden = true; tarjetaEl.dataset.k = ''; moverCamara(HOME, 1); ultimoToque = performance.now(); }
  function ubicarTarjeta(){
    if (!sel || tarjetaEl.hidden) return;
    tarjetaEl.classList.toggle('abajo', escenaEl.clientWidth < 640);
    tarjetaEl.classList.toggle('lado', escenaEl.clientWidth >= 640);
    tarjetaEl.style.left = ''; tarjetaEl.style.top = '';
  }

  /* ── Interacción en el lienzo (hover / toque sobre el mobiliario o el piso de una zona) ── */
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); const raices = Object.values(zonaG);
  const planoPiso = new THREE.Plane(new THREE.Vector3(0,1,0), 0), pto = new THREE.Vector3();
  let ultimoPunto = null;
  function zonaEn(ev){ const r = renderer.domElement.getBoundingClientRect(); ultimoPunto = null;
    ptr.set(((ev.clientX-r.left)/r.width)*2-1, -((ev.clientY-r.top)/r.height)*2+1); ray.setFromCamera(ptr, cam);
    const hit = ray.intersectObjects(raices, true).find(h=>h.object.material!==vidrio);
    if (hit){ let o = hit.object; while (o && !o.userData.zona) o = o.parent; if (o){ ultimoPunto = hit.point.clone(); return o.userData.zona; } }
    if (ray.ray.intersectPlane(planoPiso, pto)) for (const z of ZONAS) if (z.piso.some(([x0,z0,x1,z1])=>pto.x>=x0&&pto.x<=x1&&pto.z>=z0&&pto.z<=z1)){ ultimoPunto = pto.clone(); return z.k; }
    return null; }
  let lienzoHover = null, abajo = null;
  renderer.domElement.addEventListener('pointermove', ev=>{ if (ev.pointerType!=='mouse') return; lienzoHover = zonaEn(ev); renderer.domElement.style.cursor = lienzoHover ? 'pointer' : '';
    if (lienzoHover && lienzoHover!==sel){ const z = ZONAS.find(x=>x.k===lienzoHover), hr = escenaEl.getBoundingClientRect();
      tipEl.innerHTML = '<i class="fa-solid '+z.ic+'" style="color:'+z.c+'"></i> '+esc(z.t)+' <small>· clic para ver</small>';
      tipEl.style.transform = 'translate('+(ev.clientX-hr.left+14)+'px,'+(ev.clientY-hr.top+14)+'px)'; tipEl.hidden = false; }
    else tipEl.hidden = true; });
  renderer.domElement.addEventListener('pointerleave', ()=>{ lienzoHover = null; renderer.domElement.style.cursor = ''; tipEl.hidden = true; });
  renderer.domElement.addEventListener('pointerdown', ev=>{ abajo = { x:ev.clientX, y:ev.clientY }; });
  renderer.domElement.addEventListener('pointerup', ev=>{ if (!abajo || Math.hypot(ev.clientX-abajo.x, ev.clientY-abajo.y) > 6){ abajo = null; return; }
    abajo = null; const k = zonaEn(ev); if (k) abrir(k, ultimoPunto); else cerrar(); });

  /* ── Bucle ── */
  const reloj = new THREE.Clock(); let activo = true; const vtmp = new THREE.Vector3();
  const visible = () => !document.hidden && host.offsetParent !== null;
  const esfera = new THREE.Spherical(); const offs = new THREE.Vector3();
  function cuadro(){
    if (!activo) return; requestAnimationFrame(cuadro);
    const dt = Math.min(reloj.getDelta(), .05), t = reloj.elapsedTime;
    if (!visible()) return;                                    // fuera del dashboard o pestaña oculta: no consume
    const ahora = performance.now();
    for (let i=entradas.length-1;i>=0;i--){ const e = entradas[i], p = (ahora-e.t0)/850; if (p<0) continue; e.obj.visible = true;
      if (p>=1){ e.obj.position.y = e.obj.userData.yBase; e.obj.scale.copy(e.obj.userData.sBase); entradas.splice(i,1); continue; }
      if (e.tipo==='crecer'){ const s = 1 - Math.pow(1-p,3); e.obj.scale.copy(e.obj.userData.sBase).multiplyScalar(Math.max(.001,s)); }
      else e.obj.position.y = e.obj.userData.yBase + 12*(1-rebote(p)); }
    animados.forEach(g=>{ const u = g.userData; if (!u.brazos) return;
      if (u.pose==='sentado' && !u.reunion){ u.brazos[0].rotation.x = -1.15 + Math.sin(t*9+u.fase)*.09; u.brazos[1].rotation.x = -1.15 + Math.sin(t*9+u.fase+1.6)*.09; u.cabeza.rotation.x = .08 + Math.sin(t*.7+u.fase)*.05; }
      if (u.reunion){ u.cabeza.rotation.y = Math.sin(t*.6+u.fase)*.45; u.brazos[1].rotation.x = -1.15 - Math.max(0, Math.sin(t*.8+u.fase))*.6; }
      if (u.gesto){ u.brazos[1].rotation.x = -.3 - Math.max(0, Math.sin(t*.9+u.fase))*1.2; u.cabeza.rotation.y = Math.sin(t*.5+u.fase)*.25; } });
    if (!entradas.some(e=>e.obj===caminante)){ const r = caminante.userData.ruta; const a = ruta[r.i], b = ruta[(r.i+1)%ruta.length];
      r.u += dt*1.1/a.distanceTo(b); if (r.u>=1){ r.u = 0; r.i = (r.i+1)%ruta.length; }
      caminante.position.lerpVectors(a, b, r.u); caminante.rotation.y = Math.atan2(b.x-a.x, b.z-a.z);
      const s = Math.sin(t*7); caminante.userData.piernas[0].rotation.x = s*.45; caminante.userData.piernas[1].rotation.x = -s*.45;
      caminante.userData.brazos[0].rotation.x = -s*.35; caminante.userData.brazos[1].rotation.x = -.9; caminante.position.y = Math.abs(Math.cos(t*7))*.04; }
    if (manecillas){ const d = new Date(); manecillas.pm.rotation.z = -(d.getMinutes()+d.getSeconds()/60)/60*Math.PI*2; manecillas.ph.rotation.z = -((d.getHours()%12)+d.getMinutes()/60)/12*Math.PI*2; }
    const hz = hoverZona || lienzoHover;
    const pista = !sel && !hz ? ZONAS[Math.floor(t/2.4) % ZONAS.length].k : null;     // en reposo: cada sala "respira" por turnos
    ZONAS.forEach(z=>{ const obj = sel===z.k ? .6 + .2*Math.sin(t*3) : (hz===z.k ? .45 : (pista===z.k ? .28*Math.max(0, Math.sin((t%2.4)/2.4*Math.PI)) : 0));
      resaltes[z.k].forEach(m=>{ m.material.opacity += (obj - m.material.opacity) * Math.min(1, dt*8); m.visible = m.material.opacity > .01; }); });
    if (animCam){ const q = Math.min(1, (ahora-animCam.t0)/900), e = q<.5 ? 4*q*q*q : 1-Math.pow(-2*q+2,3)/2;
      offs.copy(cam.position).sub(controls.target);
      controls.target.lerpVectors(animCam.desde, animCam.hasta, e); cam.position.copy(controls.target).add(offs);
      cam.zoom = animCam.z0 + (animCam.z1-animCam.z0)*e; cam.updateProjectionMatrix(); if (q>=1) animCam = null; }
    vaivenActivo = !sel && !animCam && ahora - ultimoToque > 7000;  // vaivén suave de la cámara cuando nadie toca
    if (vaivenActivo){ offs.copy(cam.position).sub(controls.target); esfera.setFromVector3(offs);
      esfera.theta = AZ0 + Math.sin(t*.12)*.32; offs.setFromSpherical(esfera); cam.position.copy(controls.target).add(offs); cam.lookAt(controls.target); }
    controls.update();
    if (sel) ubicarTarjeta();
    renderer.render(scene, cam);
  }
  cuadro();

  const ctrl = {
    actualizar(d){ datos = d; pintarPanel(); dibujarPantallas(); pintarTarjeta(false); },
    destruir(){ activo = false; ro.disconnect(); controls.dispose(); renderer.dispose(); host.innerHTML = ''; },
    /* Para pruebas: punto en pantalla (sobre el piso) de una sala con datos */
    puntoDe(k, i=0){ const z = ZONAS.find(x=>x.k===k); if (!z) return null; const [x0,z0,x1,z1] = z.piso[i];
      const v = new THREE.Vector3((x0+x1)/2, 0, (z0+z1)/2).project(cam), r = renderer.domElement.getBoundingClientRect();
      return { x: r.left + (v.x+1)/2*r.width, y: r.top + (1-v.y)/2*r.height }; },
    cerrar(){ cerrar(); },
    claves(){ return ZONAS.map(z=>z.k); },
  };
  host.__d3 = ctrl; return ctrl;
}
