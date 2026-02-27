(() => {
  // Mario 2D – Plus
  // Adds: music toggle, richer visuals, fireballs, moving platforms, boss fight arena + final boss
  // Also: higher jump + coyote time + jump buffer for better feel

  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const HUD = {
    lives: document.getElementById("lives"),
    coins: document.getElementById("coins"),
    score: document.getElementById("score"),
    time: document.getElementById("time"),
    msg: document.getElementById("msg"),
    music: document.getElementById("music"),
  };

  const W = canvas.width, H = canvas.height;
  const TILE = 32;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // --- Input
  const input = {
    left:false, right:false, jump:false, run:false, fire:false,
    jumpPressed:false, firePressed:false, musicPressed:false,
  };

  const keyMap = {
    ArrowLeft:"left", ArrowRight:"right", ArrowUp:"jump",
    KeyA:"left", KeyD:"right", KeyW:"jump",
    Space:"jump",
    ShiftLeft:"run", ShiftRight:"run",
    KeyF:"fire", ControlLeft:"fire", ControlRight:"fire",
    KeyM:"music",
  };

  function pressAction(k){
    if (k === "jump" && !input.jump) input.jumpPressed = true;
    if (k === "fire" && !input.fire) input.firePressed = true;
    if (k === "music") input.musicPressed = true;
    input[k] = true;
  }
  function releaseAction(k){
    input[k] = false;
  }

  // unlock audio on first interaction
  let audioUnlocked = false;

  window.addEventListener("keydown", (e) => {
    const k = keyMap[e.code];
    if (!k) return;
    pressAction(k);
    unlockAudio();
    e.preventDefault();
  }, {passive:false});

  window.addEventListener("keyup", (e) => {
    const k = keyMap[e.code];
    if (!k) return;
    releaseAction(k);
    e.preventDefault();
  }, {passive:false});

  // Touch buttons
  document.querySelectorAll("#touch .btn").forEach(btn => {
    const k = btn.dataset.k;
    const down = (e) => { pressAction(k); unlockAudio(); e.preventDefault(); };
    const up = (e) => { releaseAction(k); e.preventDefault(); };
    btn.addEventListener("pointerdown", down, {passive:false});
    btn.addEventListener("pointerup", up, {passive:false});
    btn.addEventListener("pointercancel", up, {passive:false});
    btn.addEventListener("pointerleave", up, {passive:false});
  });

  // --- Audio (simple chiptune)
  const Audio = (() => {
    let ac = null;
    let master = null;
    let musicOn = false;
    let nextNoteTime = 0;
    let step = 0;

    // 4-bar loop (16 steps per bar => 64 steps)
    const bpm = 140;
    const spb = 60 / bpm;          // seconds per beat
    const stepDur = spb / 4;       // 16th notes

    // Melody + bass (MIDI-like semitone offsets from A4)
    const scale = [0, 2, 4, 7, 9, 7, 4, 2]; // upbeat
    const chord = [0, 5, 7, 12]; // simple arps
    const bass = [0, 0, -5, -5, -7, -7, -12, -12];

    function ensure(){
      if (ac) return;
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.12;
      master.connect(ac.destination);
    }

    function hzFromA4(semi){
      return 440 * Math.pow(2, semi/12);
    }

    function blip(freq, t, dur, type="square", vol=0.7){
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    function noise(t, dur, vol=0.4){
      const bufferSize = Math.floor(ac.sampleRate * dur);
      const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
      const src = ac.createBufferSource();
      src.buffer = buffer;
      const g = ac.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(g); g.connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    }

    function schedule(){
      if (!musicOn) return;
      const now = ac.currentTime;
      while (nextNoteTime < now + 0.12){
        const s = step % 64;
        const bar = Math.floor(s / 16);
        const inBar = s % 16;

        // kick/snare-ish
        if (inBar === 0 || inBar === 8) blip(60, nextNoteTime, 0.08, "sine", 0.9);
        if (inBar === 4 || inBar === 12) noise(nextNoteTime, 0.06, 0.18);

        // bass (8th notes)
        if (inBar % 2 === 0){
          const semi = -24 + bass[(bar + Math.floor(inBar/2)) % bass.length];
          blip(hzFromA4(semi), nextNoteTime, 0.10, "square", 0.35);
        }

        // melody (16th, sparse)
        if ([0,2,4,6,8,10,12,14].includes(inBar)){
          const m = scale[(bar*2 + Math.floor(inBar/2)) % scale.length];
          const c = chord[bar % chord.length];
          blip(hzFromA4(m + c), nextNoteTime, 0.08, "triangle", 0.30);
          blip(hzFromA4(m + c + 12), nextNoteTime, 0.05, "square", 0.18);
        }

        nextNoteTime += stepDur;
        step++;
      }
      requestAnimationFrame(schedule);
    }

    function toggleMusic(){
      ensure();
      musicOn = !musicOn;
      if (musicOn){
        nextNoteTime = ac.currentTime + 0.05;
        step = 0;
        schedule();
      }
      HUD.music.textContent = musicOn ? "ON" : "OFF";
      return musicOn;
    }

    function sfx(name){
      ensure();
      const t = ac.currentTime;
      if (name === "coin"){ blip(880, t, 0.05, "square", 0.25); blip(1175, t+0.03, 0.06, "square", 0.22); }
      if (name === "jump"){ blip(520, t, 0.06, "square", 0.18); }
      if (name === "stomp"){ blip(160, t, 0.08, "square", 0.20); }
      if (name === "power"){ blip(660, t, 0.10, "sawtooth", 0.16); blip(990, t+0.06, 0.10, "sawtooth", 0.14); }
      if (name === "hurt"){ blip(220, t, 0.14, "square", 0.24); }
      if (name === "bump"){ blip(320, t, 0.05, "square", 0.14); }
      if (name === "fire"){ blip(740, t, 0.05, "square", 0.15); blip(520, t+0.04, 0.06, "square", 0.12); }
      if (name === "bossHit"){ blip(180, t, 0.10, "square", 0.22); blip(140, t+0.06, 0.10, "square", 0.18); }
      if (name === "win"){ blip(784, t, 0.12, "triangle", 0.15); blip(988, t+0.12, 0.12, "triangle", 0.14); blip(1175, t+0.24, 0.16, "triangle", 0.14); }
    }

    function unlock(){
      try{
        ensure();
        if (ac.state === "suspended") ac.resume();
      } catch {}
    }

    return { toggleMusic, sfx, unlock };
  })();

  function unlockAudio(){
    if (audioUnlocked) return;
    audioUnlocked = true;
    Audio.unlock();
  }

  // --- Tile IDs
  // 0 empty
  // 1 solid ground
  // 2 brick
  // 3 question block
  // 4 spike
  // 5 flag pole (unused now)
  // 6 platform
  // 7 lava (hurts)
  const TILE_COL = {
    0: null,
    1: "#4b2e1f",
    2: "#8a4f2b",
    3: "#d4a019",
    4: "#9b1c31",
    5: "#eaeaea",
    6: "#2d5c3a",
    7: "#ff5b2a",
  };

  // --- Level
  const levelH = Math.floor(H / TILE);
  const levelW = 150;
  const map = Array.from({length: levelH}, () => Array(levelW).fill(0));

  function rectFill(tx1, ty1, tx2, ty2, id){
    for(let y=ty1; y<=ty2; y++){
      for(let x=tx1; x<=tx2; x++){
        if (x>=0 && x<levelW && y>=0 && y<levelH) map[y][x]=id;
      }
    }
  }

  // Base ground
  rectFill(0, levelH-2, levelW-1, levelH-1, 1);

  // Early platforms + pits
  rectFill(10, levelH-5, 18, levelH-5, 6);
  rectFill(24, levelH-7, 32, levelH-7, 6);
  rectFill(36, levelH-10, 41, levelH-10, 6);
  rectFill(48, levelH-6, 56, levelH-6, 6);
  rectFill(62, levelH-8, 70, levelH-8, 6);
  rectFill(78, levelH-6, 90, levelH-6, 6);

  rectFill(20, levelH-2, 22, levelH-1, 0);
  rectFill(58, levelH-2, 61, levelH-1, 0);
  rectFill(92, levelH-2, 95, levelH-1, 0);

  // Bricks + question blocks
  const qy = levelH-6;
  map[qy][12] = 3; map[qy][13] = 2; map[qy][14] = 3;
  map[qy][27] = 3; map[qy][28] = 3; map[qy-2][28] = 2;
  map[qy][50] = 3;
  map[qy][64] = 3; map[qy][65] = 2; map[qy][66] = 3;
  map[qy][82] = 3; map[qy][86] = 3;

  // Spikes + lava section before boss
  map[levelH-3][40] = 4;
  map[levelH-3][85] = 4;

  // Boss arena starts here
  const arenaStart = 112;
  const arenaEnd = 147;

  // clear pits + build arena floor
  rectFill(arenaStart, levelH-2, arenaEnd, levelH-1, 1);

  // Arena walls
  rectFill(arenaStart, 5, arenaStart+1, levelH-2, 2);
  rectFill(arenaEnd-1, 5, arenaEnd, levelH-2, 2);

  // Elevated ledges
  rectFill(arenaStart+6, levelH-6, arenaStart+12, levelH-6, 6);
  rectFill(arenaEnd-13, levelH-8, arenaEnd-7, levelH-8, 6);

  // Lava pool
  rectFill(arenaStart+20, levelH-2, arenaStart+30, levelH-2, 7);

  // Decorative columns
  rectFill(100, levelH-8, 101, levelH-2, 2);
  rectFill(104, levelH-10, 105, levelH-2, 2);

  function tileAt(tx, ty){
    if (tx<0 || ty<0 || tx>=levelW || ty>=levelH) return 1;
    return map[ty][tx];
  }
  function isSolid(id){ return id===1 || id===2 || id===3 || id===6; }
  function isHurt(id){ return id===4 || id===7; }

  // --- Helpers
  const AABB = (a,b) => (
    a.x < b.x + b.w && a.x + a.w > b.x &&
    a.y < b.y + b.h && a.y + a.h > b.y
  );

  function keyXY(tx,ty){ return `${tx},${ty}`; }

  const particles = [];
  function spawnParticles(x,y,count,spread=1.5,baseVy=-2, col="rgba(255,255,255,0.65)"){
    for(let i=0;i<count;i++){
      particles.push({
        x, y, col,
        vx:(Math.random()*2-1)*spread,
        vy: baseVy*(0.6+Math.random()*0.8) + (Math.random()*2-1)*0.5,
        life: 0.55 + Math.random()*0.45
      });
    }
  }

  // --- Moving platforms
  const movers = [
    { type:"mover", x: 72*TILE, y: (levelH-9)*TILE, w: 5*TILE, h: 12, vx: 70, minX: 70*TILE, maxX: 86*TILE },
    { type:"mover", x: 96*TILE, y: (levelH-7)*TILE, w: 4*TILE, h: 12, vy: 55, minY: (levelH-11)*TILE, maxY: (levelH-7)*TILE },
  ];

  // --- Entities
  const entities = [];

  function spawnGoomba(x,y){
    entities.push({ type:"goomba", x, y, w:24, h:20, vx:-70, vy:0, dead:false, stomped:false, stompT:0 });
  }
  function spawnMushroom(x,y){
    entities.push({ type:"mushroom", x, y, w:22, h:18, vx:140, vy:0, alive:true });
  }
  function spawnFireball(x,y,dir){
    entities.push({ type:"fire", x, y, w:10, h:10, vx: dir*520, vy: -100, life: 2.2, bounces: 3 });
  }
  function spawnBossFire(x,y,dir){
    entities.push({ type:"bossFire", x, y, w:12, h:12, vx: dir*360, vy: -60, life: 3.0, bounces: 4 });
  }

  // Populate enemies (more)
  spawnGoomba(16*TILE, (levelH-3)*TILE - 20);
  spawnGoomba(30*TILE, (levelH-3)*TILE - 20);
  spawnGoomba(53*TILE, (levelH-7)*TILE - 20);
  spawnGoomba(66*TILE, (levelH-9)*TILE - 20);
  spawnGoomba(88*TILE, (levelH-7)*TILE - 20);
  spawnGoomba(98*TILE, (levelH-3)*TILE - 20);

  // --- Question blocks state
  const qState = new Map(); // key -> {used, bump}

  // --- Player
  const player = {
    x: 3*TILE, y: (levelH-6)*TILE,
    w: 22, h: 28,
    vx: 0, vy: 0,
    onGround:false,
    face: 1,
    big: false,
    inv: 0,
    lives: 3,
    coins: 0,
    score: 0,
    // feel-good platformer
    coyote: 0,
    jumpBuf: 0,
    fireCD: 0,
  };

  function playerRect(){ return {x:player.x, y:player.y, w:player.w, h:player.h}; }

  // --- Boss
  const boss = {
    active: false,
    dead: false,
    hp: 8,
    x: (arenaEnd-10)*TILE,
    y: (levelH-6)*TILE,
    w: 52,
    h: 44,
    vx: -90,
    vy: 0,
    phaseT: 0,
    shootCD: 1.0,
    inv: 0,
  };

  // --- Coins
  const coinSet = new Set();
  function placeCoins(){
    const coords = [
      [10, levelH-6], [12, levelH-7], [14, levelH-7], [16, levelH-6],
      [24, levelH-8], [28, levelH-9], [32, levelH-8],
      [48, levelH-7], [52, levelH-8], [56, levelH-7],
      [62, levelH-9], [66, levelH-10], [70, levelH-9],
      [78, levelH-7], [84, levelH-7], [90, levelH-7],
      [100, levelH-9], [104, levelH-11],
      [arenaStart+8, levelH-7], [arenaEnd-10, levelH-9],
    ];
    coords.forEach(([x,y]) => coinSet.add(keyXY(x,y)));
  }
  placeCoins();

  // --- Game state
  let camX = 0;
  let timeLeft = 320;
  let timerAcc = 0;
  let msgT = 0;
  let won = false;
  let deadLock = 0;

  function setMsg(text, seconds=2){
    HUD.msg.textContent = text;
    msgT = seconds;
  }

  function resetPlayer(){
    player.x = 3*TILE;
    player.y = (levelH-6)*TILE;
    player.vx = player.vy = 0;
    player.big = false;
    player.inv = 1.2;
    player.coyote = 0;
    player.jumpBuf = 0;
    player.fireCD = 0;
    deadLock = 0.6;
    boss.active = false;
    boss.dead = false;
    boss.hp = 8;
    boss.x = (arenaEnd-10)*TILE;
    boss.y = (levelH-6)*TILE;
    boss.vx = -90;
    boss.vy = 0;
    boss.phaseT = 0;
    boss.shootCD = 1.0;
    boss.inv = 0;
  }

  // --- Collisions vs tiles (with head-bumps)
  function moveWithCollisions(obj, dt){
    // Horizontal
    obj.x += obj.vx * dt;
    let left = Math.floor(obj.x / TILE);
    let right = Math.floor((obj.x + obj.w) / TILE);
    let top = Math.floor(obj.y / TILE);
    let bottom = Math.floor((obj.y + obj.h - 1) / TILE);

    for(let ty=top; ty<=bottom; ty++){
      for(let tx=left; tx<=right; tx++){
        const id = tileAt(tx, ty);
        if (!isSolid(id)) continue;
        const tileRect = {x:tx*TILE, y:ty*TILE, w:TILE, h:TILE};
        if (AABB(obj, tileRect)){
          if (obj.vx > 0) obj.x = tileRect.x - obj.w - 0.001;
          else if (obj.vx < 0) obj.x = tileRect.x + TILE + 0.001;
          obj.vx = (obj.type==="goomba" || obj.type==="mushroom" || obj.type==="fire" || obj.type==="bossFire") ? -obj.vx : 0;
        }
      }
    }

    // Vertical
    obj.y += obj.vy * dt;
    left = Math.floor(obj.x / TILE);
    right = Math.floor((obj.x + obj.w) / TILE);
    top = Math.floor(obj.y / TILE);
    bottom = Math.floor((obj.y + obj.h) / TILE);

    obj.onGround = false;

    for(let ty=top; ty<=bottom; ty++){
      for(let tx=left; tx<=right; tx++){
        const id = tileAt(tx, ty);
        if (!isSolid(id)) continue;
        const tileRect = {x:tx*TILE, y:ty*TILE, w:TILE, h:TILE};
        if (!AABB(obj, tileRect)) continue;

        if (obj.vy > 0){
          obj.y = tileRect.y - obj.h - 0.001;
          obj.vy = 0;
          obj.onGround = true;
        } else if (obj.vy < 0){
          obj.y = tileRect.y + TILE + 0.001;
          obj.vy = 0;

          // Head bump interactions (player only)
          if (obj.type === "player"){
            if (id === 3) bumpQuestion(tx, ty);
            else if (id === 2){
              if (player.big){
                map[ty][tx] = 0;
                player.score += 50;
                spawnParticles(tileRect.x+TILE/2, tileRect.y+TILE/2, 14, 2.2, -3);
                Audio.sfx("bump");
              } else {
                Audio.sfx("bump");
              }
            }
          }
        }
      }
    }
  }

  function bumpQuestion(tx, ty){
    const k = keyXY(tx,ty);
    const st = qState.get(k) || {used:false, bump:0};
    st.bump = 1;
    if (st.used){
      qState.set(k, st);
      Audio.sfx("bump");
      return;
    }
    st.used = true;
    qState.set(k, st);

    const worldX = tx*TILE + TILE/2;
    const worldY = ty*TILE - 10;

    if (!player.big){
      spawnMushroom(worldX-11, worldY);
      setMsg("Mushroom!");
      Audio.sfx("power");
      player.score += 150;
    } else {
      player.coins += 1;
      player.score += 120;
      spawnParticles(worldX, worldY, 10, 1.6, -2.8, "rgba(255,215,90,0.75)");
      Audio.sfx("coin");
    }
  }

  // --- Damage
  function damagePlayer(instantDeath){
    if (won) return;
    if (player.inv > 0) return;

    if (instantDeath){
      player.big = false;
      player.lives -= 1;
      player.inv = 1.6;
      Audio.sfx("hurt");
      setMsg("Ouch!");
      if (player.lives <= 0){
        setMsg("GAME OVER — refresh to restart", 999);
        deadLock = 999;
      } else {
        resetPlayer();
      }
      return;
    }

    if (player.big){
      player.big = false;
      player.inv = 1.2;
      Audio.sfx("hurt");
      setMsg("Small!");
      spawnParticles(player.x+player.w/2, player.y+player.h/2, 18, 2.2, -3);
    } else {
      player.lives -= 1;
      player.inv = 1.6;
      Audio.sfx("hurt");
      setMsg("Ouch!");
      spawnParticles(player.x+player.w/2, player.y+player.h/2, 18, 2.2, -3);
      if (player.lives <= 0){
        setMsg("GAME OVER — refresh to restart", 999);
        deadLock = 999;
      } else {
        resetPlayer();
      }
    }
  }

  // --- Entity movement (no head bump effects)
  function moveEntity(e, dt){
    e.x += e.vx * dt;
    let left = Math.floor(e.x / TILE);
    let right = Math.floor((e.x + e.w) / TILE);
    let top = Math.floor(e.y / TILE);
    let bottom = Math.floor((e.y + e.h - 1) / TILE);

    for(let ty=top; ty<=bottom; ty++){
      for(let tx=left; tx<=right; tx++){
        const id = tileAt(tx, ty);
        if (!isSolid(id)) continue;
        const tileRect = {x:tx*TILE, y:ty*TILE, w:TILE, h:TILE};
        if (AABB(e, tileRect)){
          if (e.vx > 0) e.x = tileRect.x - e.w - 0.001;
          else if (e.vx < 0) e.x = tileRect.x + TILE + 0.001;
          e.vx *= -1;
          if (e.type === "fire" || e.type === "bossFire") e.bounces = (e.bounces ?? 2) - 1;
        }
      }
    }

    e.y += e.vy * dt;
    left = Math.floor(e.x / TILE);
    right = Math.floor((e.x + e.w) / TILE);
    top = Math.floor(e.y / TILE);
    bottom = Math.floor((e.y + e.h) / TILE);

    e.onGround = false;

    for(let ty=top; ty<=bottom; ty++){
      for(let tx=left; tx<=right; tx++){
        const id = tileAt(tx, ty);
        if (!isSolid(id)) continue;
        const tileRect = {x:tx*TILE, y:ty*TILE, w:TILE, h:TILE};
        if (!AABB(e, tileRect)) continue;

        if (e.vy > 0){
          e.y = tileRect.y - e.h - 0.001;
          e.vy = 0;
          e.onGround = true;
          if (e.type === "fire" || e.type === "bossFire"){
            e.vy = -420;
            e.bounces = (e.bounces ?? 2) - 1;
          }
        } else if (e.vy < 0){
          e.y = tileRect.y + TILE + 0.001;
          e.vy = 0;
        }
      }
    }
  }

  // --- Moving platforms update + rider support
  function updateMovers(dt){
    for (const m of movers){
      const prevX = m.x, prevY = m.y;

      if (m.vx){
        m.x += m.vx * dt;
        if (m.x < m.minX){ m.x = m.minX; m.vx *= -1; }
        if (m.x + m.w > m.maxX){ m.x = m.maxX - m.w; m.vx *= -1; }
      }
      if (m.vy){
        m.y += m.vy * dt;
        if (m.y < m.minY){ m.y = m.minY; m.vy *= -1; }
        if (m.y > m.maxY){ m.y = m.maxY; m.vy *= -1; }
      }

      // move player if standing on it
      const pr = playerRect();
      const topRect = { x:m.x, y:m.y-2, w:m.w, h:6 };
      if (player.vy >= 0 && AABB(pr, topRect)){
        const feet = player.y + player.h;
        if (Math.abs(feet - m.y) < 10){
          player.x += (m.x - prevX);
          player.y += (m.y - prevY);
        }
      }
    }
  }

  // --- Boss update
  function updateBoss(dt){
    if (boss.dead) return;

    boss.inv = Math.max(0, boss.inv - dt);

    // activation when player enters arena
    if (!boss.active){
      const pTx = Math.floor((player.x + player.w/2)/TILE);
      if (pTx >= arenaStart+3){
        boss.active = true;
        setMsg("FINAL BOSS!", 2.2);
      } else {
        return;
      }
    }

    boss.phaseT += dt;
    boss.shootCD -= dt;

    // boss movement
    const GRAV = 2400, MAX_FALL = 1800;
    boss.vy = clamp(boss.vy + GRAV*dt, -99999, MAX_FALL);

    // simple AI: pace + occasional jump + faster at low hp
    const speed = 90 + (8 - boss.hp) * 10;
    boss.vx = boss.vx > 0 ? speed : -speed;

    // jump if near lava or randomly
    const nearLava = (Math.floor((boss.x+boss.w/2)/TILE) >= arenaStart+19 && Math.floor((boss.x+boss.w/2)/TILE) <= arenaStart+31);
    if (boss.onGround && (nearLava || (boss.phaseT > 1.2 && Math.random() < 0.012 + (8-boss.hp)*0.002))){
      boss.vy = -860;
      boss.onGround = false;
      boss.phaseT = 0;
    }

    // Shoot fireballs
    if (boss.shootCD <= 0){
      boss.shootCD = 1.3 - (8-boss.hp)*0.08;
      const dir = (player.x < boss.x) ? -1 : 1;
      spawnBossFire(boss.x + boss.w/2 + dir*16, boss.y + 14, dir);
    }

    // move with collisions (reuse entity move)
    moveEntity(boss, dt);

    // boss vs player touch
    const pr = playerRect();
    const br = {x:boss.x, y:boss.y, w:boss.w, h:boss.h};
    if (AABB(pr, br)){
      // stomp check
      const falling = player.vy > 160;
      const playerBottom = player.y + player.h;
      if (falling && playerBottom - boss.y < 18 && boss.inv <= 0){
        boss.hp -= 1;
        boss.inv = 0.35;
        player.vy = -740;
        player.score += 500;
        Audio.sfx("bossHit");
        spawnParticles(boss.x+boss.w/2, boss.y+boss.h/2, 18, 2.5, -3.2, "rgba(255,120,120,0.75)");
        setMsg(`Boss HP: ${boss.hp}`, 1.1);
        if (boss.hp <= 0){
          boss.dead = true;
          won = true;
          setMsg("YOU WIN! 🎉", 999);
          Audio.sfx("win");
          spawnParticles(boss.x+boss.w/2, boss.y+boss.h/2, 80, 3.2, -4.0, "rgba(255,220,160,0.75)");
        }
      } else {
        damagePlayer(false);
        player.vx = (player.x < boss.x ? -420 : 420);
        player.vy = -420;
      }
    }
  }

  // --- Update loop
  const GRAV = 2400;
  const MAX_FALL = 1800;

  function update(dt){
    if (msgT > 0){
      msgT -= dt;
      if (msgT <= 0) HUD.msg.textContent = "";
    }

    if (deadLock > 0) deadLock -= dt;

    // music toggle (M)
    if (input.musicPressed){
      input.musicPressed = false;
      const on = Audio.toggleMusic();
      setMsg(on ? "Music ON" : "Music OFF", 1.2);
    }

    // Timer
    if (!won){
      timerAcc += dt;
      while (timerAcc >= 1){
        timerAcc -= 1;
        timeLeft = Math.max(0, timeLeft-1);
        if (timeLeft === 0) damagePlayer(true);
      }
    }

    // Player size
    player.h = player.big ? 36 : 28;

    // Better jump feel: coyote + buffer
    player.coyote = player.onGround ? 0.12 : Math.max(0, player.coyote - dt);
    player.jumpBuf = Math.max(0, player.jumpBuf - dt);
    if (input.jumpPressed){
      input.jumpPressed = false;
      player.jumpBuf = 0.12;
    }

    // Movement
    const accel = input.run ? 2600 : 1900;
    const maxSpeed = input.run ? 460 : 330;
    const friction = player.onGround ? 0.80 : 0.92;

    if (!won && deadLock <= 0){
      if (input.left) { player.vx -= accel * dt; player.face = -1; }
      if (input.right){ player.vx += accel * dt; player.face =  1; }
      if (!input.left && !input.right) player.vx *= friction;
      player.vx = clamp(player.vx, -maxSpeed, maxSpeed);

      // Jump (higher)
      if (player.jumpBuf > 0 && player.coyote > 0){
        player.jumpBuf = 0;
        player.coyote = 0;
        player.vy = -920; // INCREASED jump height ✅
        player.onGround = false;
        Audio.sfx("jump");
        spawnParticles(player.x+player.w/2, player.y+player.h, 12, 2.0, -3.0);
      }

      // Variable height (release early)
      if (!input.jump && player.vy < 0){
        player.vy *= 0.93;
      }

      // Fireball (only when BIG)
      player.fireCD = Math.max(0, player.fireCD - dt);
      if (input.firePressed){
        input.firePressed = false;
        if (player.big && player.fireCD <= 0){
          player.fireCD = 0.32;
          spawnFireball(player.x + player.w/2 + player.face*16, player.y + 10, player.face);
          Audio.sfx("fire");
        }
      }
    } else if (won){
      player.vx = lerp(player.vx, 120, dt*2);
    }

    // Gravity
    player.vy = clamp(player.vy + GRAV*dt, -99999, MAX_FALL);

    // Movers first (so you can ride them)
    updateMovers(dt);

    // Move player
    moveWithCollisions(player, dt);

    // Hurt tiles underfoot
    const pMidX = player.x + player.w/2;
    const pFootY = player.y + player.h - 2;
    const tx = Math.floor(pMidX / TILE);
    const ty = Math.floor(pFootY / TILE);
    if (isHurt(tileAt(tx, ty))) damagePlayer(false);

    // Fall death
    if (player.y > levelH*TILE + 300) damagePlayer(true);

    // i-frames
    if (player.inv > 0) player.inv -= dt;

    // coins
    handleCoinPickups();

    // question bump decay
    for(const st of qState.values()){
      if (st.bump > 0) st.bump = Math.max(0, st.bump - dt*6);
    }

    // Entities update
    for(const e of entities){
      if (e.type === "goomba"){
        if (e.dead) continue;
        e.vy = clamp(e.vy + GRAV*dt, -99999, MAX_FALL);
        moveEntity(e, dt);
        handleGoombaVsPlayer(e);
      } else if (e.type === "mushroom"){
        if (!e.alive) continue;
        e.vy = clamp(e.vy + GRAV*dt, -99999, MAX_FALL);
        moveEntity(e, dt);
        if (AABB(playerRect(), e)){
          e.alive = false;
          player.big = true;
          player.inv = 0.8;
          player.score += 500;
          setMsg("BIG!");
          Audio.sfx("power");
          spawnParticles(e.x+e.w/2, e.y+e.h/2, 16, 2.2, -3, "rgba(255,220,160,0.75)");
        }
      } else if (e.type === "fire" || e.type === "bossFire"){
        e.life -= dt;
        e.vy = clamp(e.vy + GRAV*dt, -99999, MAX_FALL);
        moveEntity(e, dt);

        // hurt tiles (lava spikes)
        const midX = e.x + e.w/2, midY = e.y + e.h/2;
        const ttx = Math.floor(midX / TILE), tty = Math.floor(midY / TILE);
        if (isHurt(tileAt(ttx, tty))) { e.life = -1; }

        // collisions: fireball vs enemies/boss/player
        if (e.type === "fire"){
          // vs goombas
          for(const g of entities){
            if (g.type !== "goomba" || g.dead) continue;
            if (AABB({x:e.x,y:e.y,w:e.w,h:e.h},{x:g.x,y:g.y,w:g.w,h:g.h})){
              g.dead = true;
              g.stomped = true;
              g.stompT = 0.25;
              e.life = -1;
              player.score += 200;
              spawnParticles(g.x+g.w/2, g.y+g.h/2, 16, 2.2, -3);
              Audio.sfx("stomp");
              break;
            }
          }
          // vs boss
          if (boss.active && !boss.dead && boss.inv <= 0){
            const br = {x:boss.x, y:boss.y, w:boss.w, h:boss.h};
            if (AABB({x:e.x,y:e.y,w:e.w,h:e.h}, br)){
              boss.hp -= 1;
              boss.inv = 0.25;
              e.life = -1;
              player.score += 500;
              Audio.sfx("bossHit");
              spawnParticles(boss.x+boss.w/2, boss.y+boss.h/2, 18, 2.5, -3.2, "rgba(255,120,120,0.75)");
              setMsg(`Boss HP: ${boss.hp}`, 1.0);
              if (boss.hp <= 0){
                boss.dead = true;
                won = true;
                setMsg("YOU WIN! 🎉", 999);
                Audio.sfx("win");
                spawnParticles(boss.x+boss.w/2, boss.y+boss.h/2, 80, 3.2, -4.0, "rgba(255,220,160,0.75)");
              }
            }
          }
        } else {
          // bossFire vs player
          if (!won && AABB(playerRect(), {x:e.x,y:e.y,w:e.w,h:e.h})){
            e.life = -1;
            damagePlayer(false);
            player.vx = (player.x < boss.x ? -420 : 420);
            player.vy = -420;
          }
        }

        if ((e.bounces ?? 1) < 0) e.life = -1;
      }
    }

    // Cleanup
    for(let i=entities.length-1;i>=0;i--){
      const e = entities[i];
      if (e.type==="mushroom" && !e.alive) entities.splice(i,1);
      if (e.type==="goomba" && e.dead && e.stomped){
        e.stompT -= dt;
        if (e.stompT <= 0) entities.splice(i,1);
      }
      if ((e.type==="fire" || e.type==="bossFire") && e.life <= 0) entities.splice(i,1);
    }

    // Boss
    if (!won) updateBoss(dt);

    // Particles
    for(let i=particles.length-1;i>=0;i--){
      const p = particles[i];
      p.vy += 1400*dt;
      p.x += p.vx*dt*60;
      p.y += p.vy*dt*60;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i,1);
    }

    // Camera
    const levelPxW = levelW*TILE;

    // If boss active, lock camera in arena
    const arenaMinX = arenaStart*TILE;
    const arenaMaxX = (arenaEnd*TILE) - W;
    let targetX = clamp(player.x + player.w/2 - W/2, 0, levelPxW - W);
    if (boss.active && !won){
      targetX = clamp(targetX, arenaMinX, arenaMaxX);
    }

    camX = lerp(camX, targetX, 1 - Math.pow(0.000001, dt));

    // HUD
    HUD.lives.textContent = String(player.lives);
    HUD.coins.textContent = String(player.coins);
    HUD.score.textContent = String(player.score);
    HUD.time.textContent = String(timeLeft);
  }

  function handleGoombaVsPlayer(g){
    const pr = playerRect();
    const gr = {x:g.x, y:g.y, w:g.w, h:g.h};
    if (!AABB(pr, gr)) return;

    const playerBottom = player.y + player.h;
    const goombaTop = g.y;
    const falling = player.vy > 160;

    if (falling && playerBottom - goombaTop < 14){
      g.dead = true;
      g.stomped = true;
      g.stompT = 0.25;
      player.vy = -760;
      player.score += 200;
      spawnParticles(g.x+g.w/2, g.y+g.h/2, 14, 2.0, -2.6);
      Audio.sfx("stomp");
    } else {
      damagePlayer(false);
      player.vx = (player.x < g.x ? -360 : 360);
      player.vy = -420;
    }
  }

  function handleCoinPickups(){
    const pr = playerRect();
    const tx0 = Math.floor((pr.x - 20) / TILE);
    const tx1 = Math.floor((pr.x + pr.w + 20) / TILE);
    const ty0 = Math.floor((pr.y - 20) / TILE);
    const ty1 = Math.floor((pr.y + pr.h + 20) / TILE);

    for(let ty=ty0; ty<=ty1; ty++){
      for(let tx=tx0; tx<=tx1; tx++){
        const k = keyXY(tx,ty);
        if (!coinSet.has(k)) continue;
        const coinRect = {x: tx*TILE + 8, y: ty*TILE + 8, w: 16, h: 16};
        if (AABB(pr, coinRect)){
          coinSet.delete(k);
          player.coins += 1;
          player.score += 100;
          spawnParticles(coinRect.x+8, coinRect.y+8, 12, 1.9, -3, "rgba(255,215,90,0.75)");
          Audio.sfx("coin");
        }
      }
    }
  }

  // --- Draw
  function roundRect(x,y,w,h,r,fill){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    if (fill) ctx.fill();
  }
  function tri(x,y,w,h){
    ctx.beginPath();
    ctx.moveTo(x, y+h);
    ctx.lineTo(x+w*0.5, y);
    ctx.lineTo(x+w, y+h);
    ctx.closePath();
    ctx.fill();
  }
  function cloud(x,y,s){
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(s,s);
    roundRect(0, 10, 70, 26, 16, true);
    roundRect(18, 0, 34, 24, 14, true);
    roundRect(42, 8, 40, 22, 14, true);
    ctx.restore();
  }

  function drawParallax(){
    const t = camX;

    // stars
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i=0;i<160;i++){
      const sx = (i*97 % (W+800)) - ((t*0.15) % (W+800));
      const sy = (i*53 % 260);
      ctx.fillRect(sx, sy, 1, 1);
      if (i%9===0) ctx.fillRect(sx+2, sy, 1, 1);
    }
    ctx.restore();

    // mountains + clouds
    ctx.save();

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = "#0f1f4a";
    for(let i=0;i<16;i++){
      const x = ((i*220) - (t*0.18 % 220)) - 60;
      const y = 290 + (i%3)*14;
      tri(x, y, 160, 140);
    }

    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "#143061";
    for(let i=0;i<18;i++){
      const x = ((i*180) - (t*0.28 % 180)) - 60;
      const y = 345 + (i%2)*18;
      tri(x, y, 130, 110);
    }

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    for(let i=0;i<12;i++){
      const x = ((i*260) - (t*0.45 % 260)) - 80;
      const y = 70 + (i%4)*22;
      cloud(x, y, 1 + (i%3)*0.15);
    }

    ctx.restore();
  }

  function drawTiles(){
    const startX = Math.floor(camX / TILE) - 2;
    const endX = startX + Math.floor(W / TILE) + 6;

    for(let y=0;y<levelH;y++){
      for(let x=startX;x<=endX;x++){
        const id = tileAt(x,y);
        if (id===0) continue;

        const px = x*TILE, py = y*TILE;

        // question bump
        let bump = 0;
        if (id===3){
          const st = qState.get(keyXY(x,y));
          if (st && st.bump>0) bump = Math.sin(st.bump*Math.PI) * 8;
        }

        if (id===4){
          ctx.fillStyle = "#8b1530";
          ctx.beginPath();
          ctx.moveTo(px, py+TILE);
          ctx.lineTo(px+TILE/2, py+6);
          ctx.lineTo(px+TILE, py+TILE);
          ctx.closePath();
          ctx.fill();
          continue;
        }

        if (id===7){
          // lava tile (animated)
          const bob = Math.sin(performance.now()/160 + x*0.7) * 2;
          ctx.fillStyle = "#ff5b2a";
          ctx.fillRect(px, py + bob, TILE, TILE-bob);
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fillRect(px, py + 6 + bob, TILE, 3);
          continue;
        }

        ctx.fillStyle = TILE_COL[id] || "#fff";
        ctx.fillRect(px, py - bump, TILE, TILE);

        // details
        if (id===1){
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(px, py - bump, TILE, 6);
        }
        if (id===2){
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          for(let i=0;i<3;i++) ctx.fillRect(px+4, py+6+i*9 - bump, TILE-8, 2);
        }
        if (id===3){
          const st = qState.get(keyXY(x,y));
          ctx.fillStyle = st?.used ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.22)";
          ctx.fillRect(px+5, py+5 - bump, TILE-10, TILE-10);
          if (!st?.used){
            ctx.fillStyle = "#2b1a09";
            ctx.font = "900 18px system-ui";
            ctx.fillText("?", px+11, py+22 - bump);
          }
        }
        if (id===6){
          ctx.fillStyle = "rgba(255,255,255,0.10)";
          ctx.fillRect(px, py - bump, TILE, 5);
        }
      }
    }
  }

  function drawCoins(){
    ctx.save();
    ctx.globalAlpha = 0.95;
    const startX = Math.floor(camX / TILE) - 2;
    const endX = startX + Math.floor(W / TILE) + 6;

    for(let y=0;y<levelH;y++){
      for(let x=startX;x<=endX;x++){
        const k = keyXY(x,y);
        if (!coinSet.has(k)) continue;
        const px = x*TILE + 16;
        const py = y*TILE + 16;
        const bob = Math.sin((performance.now()/180) + x*0.7) * 3;

        ctx.fillStyle = "rgba(255, 215, 90, 0.95)";
        ctx.beginPath();
        ctx.ellipse(px, py+bob, 7, 10, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.ellipse(px-2, py-2+bob, 2.2, 4, 0, 0, Math.PI*2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawMovers(){
    for (const m of movers){
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.fillStyle = "rgba(210,240,255,0.12)";
      roundRect(0, 0, m.w, m.h, 8, true);
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(6, 3, m.w-12, 3);
      ctx.restore();
    }
  }

  function drawEntities(){
    for(const e of entities){
      if (e.type==="goomba"){
        if (e.dead && e.stomped){
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = "#7b4a2b";
          ctx.fillRect(e.x, e.y + e.h/2, e.w, e.h/2);
          ctx.restore();
          continue;
        }
        ctx.save();
        ctx.translate(e.x, e.y);

        ctx.fillStyle = "#7b4a2b";
        roundRect(0, 4, e.w, e.h, 6, true);

        ctx.fillStyle = "#2b1a09";
        ctx.fillRect(6, 10, 4, 4);
        ctx.fillRect(e.w-10, 10, 4, 4);

        // feet
        const step = Math.sin(performance.now()/110 + e.x*0.01) * 2;
        ctx.fillStyle = "#2b1a09";
        ctx.fillRect(3, e.h + step, 8, 5);
        ctx.fillRect(e.w-11, e.h - step, 8, 5);

        ctx.restore();
      }

      if (e.type==="mushroom"){
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.fillStyle = "#d94b4b";
        roundRect(0, 0, e.w, 10, 6, true);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fillRect(3, 2, e.w-6, 3);
        ctx.fillStyle = "#f0d7c2";
        roundRect(3, 8, e.w-6, e.h-6, 6, true);
        ctx.restore();
      }

      if (e.type==="fire" || e.type==="bossFire"){
        ctx.save();
        const glow = (e.type==="bossFire") ? "rgba(255,90,90,0.35)" : "rgba(255,200,90,0.30)";
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.ellipse(e.x+e.w/2, e.y+e.h/2, 10, 10, 0, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = (e.type==="bossFire") ? "rgba(255,120,120,0.95)" : "rgba(255,215,90,0.95)";
        ctx.beginPath();
        ctx.ellipse(e.x+e.w/2, e.y+e.h/2, 5, 5, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawBoss(){
    if (!boss.active || boss.dead) return;

    ctx.save();
    ctx.translate(boss.x, boss.y);

    // body
    const blink = boss.inv > 0 && Math.floor(performance.now()/70)%2===0;
    ctx.globalAlpha = blink ? 0.35 : 1;

    ctx.fillStyle = "#3a2b20";
    roundRect(0, 10, boss.w, boss.h-6, 12, true);

    // armor plate
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(8, 18, boss.w-16, boss.h-24, 10, true);

    // eyes
    ctx.fillStyle = "#eaf0ff";
    ctx.fillRect(14, 22, 10, 10);
    ctx.fillRect(boss.w-24, 22, 10, 10);
    ctx.fillStyle = "#111827";
    ctx.fillRect(18, 26, 4, 4);
    ctx.fillRect(boss.w-20, 26, 4, 4);

    // horns
    ctx.fillStyle = "#cfd6e8";
    ctx.beginPath();
    ctx.moveTo(8, 16); ctx.lineTo(2, 6); ctx.lineTo(14, 10); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(boss.w-8, 16); ctx.lineTo(boss.w-2, 6); ctx.lineTo(boss.w-14, 10); ctx.closePath(); ctx.fill();

    // health bar
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    roundRect(-4, -10, boss.w+8, 8, 6, true);
    ctx.fillStyle = "rgba(255,120,120,0.9)";
    const pct = clamp(boss.hp/8, 0, 1);
    roundRect(-2, -9, (boss.w+4)*pct, 6, 6, true);

    ctx.restore();
  }

  function drawPlayer(){
    const blink = player.inv > 0 && Math.floor(performance.now()/70)%2===0;
    if (blink) return;

    ctx.save();
    ctx.translate(player.x, player.y);

    // shadow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(player.w/2, player.h+6, player.w*0.55, 6, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const bodyH = player.big ? 24 : 18;
    const headH = player.big ? 14 : 12;
    const bob = Math.sin(performance.now()/100) * (Math.abs(player.vx)>40 ? 1 : 0);

    // legs
    ctx.fillStyle = "#2b64d6";
    roundRect(3, bodyH + bob, player.w-6, player.h-bodyH-2, 6, true);

    // torso
    ctx.fillStyle = "#d44b3a";
    roundRect(2, headH + bob, player.w-4, bodyH-headH+6, 7, true);

    // head
    ctx.fillStyle = "#f0c7a5";
    roundRect(3, 0 + bob, player.w-6, headH+4, 7, true);

    // hat
    ctx.fillStyle = "#c53c2f";
    roundRect(2, 0 + bob, player.w-4, 6, 6, true);

    // face
    ctx.fillStyle = "#2b1a09";
    const eyeX = player.face === 1 ? player.w-9 : 5;
    ctx.fillRect(eyeX, headH-2 + bob, 3, 3);

    // moustache
    ctx.fillStyle = "rgba(43,26,9,0.85)";
    ctx.fillRect(6, headH+3 + bob, player.w-12, 3);

    ctx.restore();
  }

  function drawParticles(){
    ctx.save();
    for(const p of particles){
      const a = clamp(p.life/1.0, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x-1, p.y-1, 2, 2);
    }
    ctx.restore();
  }

  function drawArenaGate(){
    if (!boss.active || won) return;
    // draw a subtle gate at arena entrance
    const gateX = (arenaStart+2)*TILE;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(gateX, 0, 8, H);
    ctx.restore();
  }

  function draw(){
    ctx.clearRect(0,0,W,H);

    drawParallax();

    ctx.save();
    ctx.translate(-Math.floor(camX), 0);

    drawTiles();
    drawCoins();
    drawMovers();
    drawEntities();
    drawBoss();
    drawPlayer();
    drawParticles();
    drawArenaGate();

    ctx.restore();

    // vignette
    ctx.save();
    const g = ctx.createRadialGradient(W*0.5,H*0.45, 120, W*0.5,H*0.5, 520);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W,H);
    ctx.restore();
  }

  // --- Main loop
  let last = performance.now();
  function loop(now){
    const dt = clamp((now - last)/1000, 0, 0.033);
    last = now;

    if (deadLock < 999){
      update(dt);
    }
    draw();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

})();
