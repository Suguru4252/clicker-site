(async function() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // Загрузка данных
    const [worlds, armors, weapons, mobTypes, classes] = await Promise.all([
        fetch('data/worlds.json').then(r => r.json()),
        fetch('data/armors.json').then(r => r.json()),
        fetch('data/weapons.json').then(r => r.json()),
        fetch('data/mobs.json').then(r => r.json()),
        fetch('data/classes.json').then(r => r.json())
    ]);
    
    // ========== РАЗМЕР МИРА ==========
    const WORLD_WIDTH = 7800;
    const WORLD_HEIGHT = 6200;
    
    let cameraX = 0, cameraY = 0;
    let canvasWidth, canvasHeight;
    
    function resizeCanvas() {
        canvasWidth = window.innerWidth;
        canvasHeight = window.innerHeight;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
    }
    window.addEventListener('resize', () => { resizeCanvas(); updateCamera(); });
    resizeCanvas();
    
    // ========== ТЕКУЩИЙ МИР ==========
    let currentWorldId = "forest";
    let currentWorld = worlds[currentWorldId];
    
    // ========== ИНВЕНТАРЬ ==========
    let inventory = {
        potionHp: 5, potionMp: 5, potionBigHp: 1, potionBigMp: 1,
        armorId: "cloth", weaponId: "dagger",
        armor: armors[0], weapon: weapons[0]
    };
    
    function getArmorById(id) { return armors.find(a => a.id === id); }
    function getWeaponById(id) { return weapons.find(w => w.id === id); }
    
    // ========== СТАТИСТИКА ==========
    let stats = {
        mobsKilled: 0, totalGold: 0, totalDamage: 0, totalDamageTaken: 0,
        criticalHits: 0, dodges: 0, skillsUsed: 0, potionsUsed: 0,
        startTime: Date.now()
    };
    function getPlayTime() { let s = Math.floor((Date.now() - stats.startTime) / 1000); return { h: Math.floor(s/3600), m: Math.floor((s%3600)/60), s: s%60 }; }
    
    // ========== ИГРОК ==========
    let player = {
        x: 0, y: 0,
        targetX: null, targetY: null, path: [],
        hp: 450, maxHp: 450, mp: 100, maxMp: 100,
        level: 1, exp: 0, expToNext: 120,
        classType: "warrior",
        gold: 800, bankGold: 0,
        speed: 5.2, defense: 8,
        attackTimer: 0, superCooldown: 0,
        critChance: 12, dodgeChance: 6
    };
    
    function updateGear() {
        let armor = getArmorById(inventory.armorId);
        let weapon = getWeaponById(inventory.weaponId);
        inventory.armor = armor;
        inventory.weapon = weapon;
        player.defense = armor.def + Math.floor(player.level * 1.3);
        let cls = classes[player.classType];
        player.critChance = cls.crit + Math.floor(player.level * 0.5);
        player.dodgeChance = cls.dodge + Math.floor(player.level * 0.4);
        player.maxHp = cls.hpBase + player.level * 18;
        player.maxMp = cls.mpBase + player.level * 14;
        if(player.hp > player.maxHp) player.hp = player.maxHp;
        if(player.mp > player.maxMp) player.mp = player.maxMp;
    }
    
    function getDamageRange() { return { min: inventory.weapon.dmgMin + Math.floor(player.level * 2.5), max: inventory.weapon.dmgMax + Math.floor(player.level * 3.2) }; }
    function getAttackRange() { return inventory.weapon.range; }
    
    // ========== БЕЗОПАСНАЯ ЗОНА ==========
    let safeZone = { x: 700, y: 600, width: 700, height: 540 };
    let npcs = {
        shop: { x: safeZone.x + safeZone.width - 120, y: safeZone.y + safeZone.height - 90, radius: 35, name: "Торговец", icon: "🏪" },
        healer: { x: safeZone.x + 100, y: safeZone.y + safeZone.height - 90, radius: 35, name: "Лекарь", icon: "💚" },
        banker: { x: safeZone.x + safeZone.width/2, y: safeZone.y + 80, radius: 35, name: "Банкир", icon: "🏦" },
        worldPortal: { x: safeZone.x + safeZone.width - 250, y: safeZone.y + 50, radius: 35, name: "Портал миров", icon: "🌍" }
    };
    
    let gates = [
        { x: safeZone.x + safeZone.width/2 - 80, y: safeZone.y - 45, width: 160, height: 55 },
        { x: safeZone.x + safeZone.width/2 - 80, y: safeZone.y + safeZone.height - 10, width: 160, height: 55 },
        { x: safeZone.x - 45, y: safeZone.y + safeZone.height/2 - 80, width: 55, height: 160 },
        { x: safeZone.x + safeZone.width - 10, y: safeZone.y + safeZone.height/2 - 80, width: 55, height: 160 }
    ];
    
    function isInSafeZone(x,y) { return x>safeZone.x && x<safeZone.x+safeZone.width && y>safeZone.y && y<safeZone.y+safeZone.height; }
    function isAtGate(x,y) { for(let g of gates) if(x>g.x && x<g.x+g.width && y>g.y && y<g.y+g.height) return true; return false; }
    function canCrossBoundary(fx,fy,tx,ty) { let was=isInSafeZone(fx,fy), will=isInSafeZone(tx,ty); if(was===will) return true; let mx=(fx+tx)/2, my=(fy+ty)/2; return isAtGate(mx,my) || isAtGate(tx,ty) || isAtGate(fx,fy); }
    
    // ========== ПРЕПЯТСТВИЯ ==========
    let obstacles = [];
    function generateWorld() {
        obstacles = [];
        for(let i=0;i<52;i++) { let fx=safeZone.x+i*30; if(!(fx>gates[0].x-35 && fx<gates[0].x+gates[0].width+35)) obstacles.push({x:fx,y:safeZone.y-28,radius:15,type:'fence'}); if(!(fx>gates[1].x-35 && fx<gates[1].x+gates[1].width+35)) obstacles.push({x:fx,y:safeZone.y+safeZone.height+18,radius:15,type:'fence'}); }
        for(let i=0;i<44;i++) { let fy=safeZone.y+i*30; if(!(fy>gates[2].y-35 && fy<gates[2].y+gates[2].height+35)) obstacles.push({x:safeZone.x-28,y:fy,radius:15,type:'fence'}); if(!(fy>gates[3].y-35 && fy<gates[3].y+gates[3].height+35)) obstacles.push({x:safeZone.x+safeZone.width+18,y:fy,radius:15,type:'fence'}); }
        for(let i=0;i<700;i++) { let x=120+Math.random()*(WORLD_WIDTH-240), y=120+Math.random()*(WORLD_HEIGHT-240); if(x>safeZone.x-120 && x<safeZone.x+safeZone.width+120 && y>safeZone.y-120 && y<safeZone.y+safeZone.height+120) continue; obstacles.push({x,y,radius:30,type:'tree'}); }
        for(let i=0;i<150;i++) { let x=150+Math.random()*(WORLD_WIDTH-300), y=150+Math.random()*(WORLD_HEIGHT-300); if(x>safeZone.x-140 && x<safeZone.x+safeZone.width+140 && y>safeZone.y-140 && y<safeZone.y+safeZone.height+140) continue; obstacles.push({x,y,radius:48,type:'mountain'}); }
        for(let i=0;i<400;i++) { let x=70+Math.random()*(WORLD_WIDTH-140), y=70+Math.random()*(WORLD_HEIGHT-140); if(x>safeZone.x-90 && x<safeZone.x+safeZone.width+90 && y>safeZone.y-90 && y<safeZone.y+safeZone.height+90) continue; obstacles.push({x,y,radius:20,type:'rock'}); }
        for(let i=0;i<350;i++) { let x=50+Math.random()*(WORLD_WIDTH-100), y=50+Math.random()*(WORLD_HEIGHT-100); if(x>safeZone.x-70 && x<safeZone.x+safeZone.width+70 && y>safeZone.y-70 && y<safeZone.y+safeZone.height+70) continue; obstacles.push({x,y,radius:14,type:'bush'}); }
        for(let r=0;r<25;r++) { let sx=250+Math.random()*(WORLD_WIDTH-500), sy=200+Math.random()*(WORLD_HEIGHT-400), ang=Math.random()*Math.PI*2, len=500+Math.random()*600; for(let s=0;s<30;s++) { let t=s/29, x=sx+Math.cos(ang)*len*t+(Math.random()-0.5)*60, y=sy+Math.sin(ang)*len*t+(Math.random()-0.5)*60; if(x>safeZone.x-180 && x<safeZone.x+safeZone.width+180 && y>safeZone.y-180 && y<safeZone.y+safeZone.height+180) continue; obstacles.push({x,y,radius:24,type:'river'}); } }
    }
    function isWalkable(x,y,r=28) { if(x-r<40 || x+r>WORLD_WIDTH-40 || y-r<40 || y+r>WORLD_HEIGHT-40) return false; for(let o of obstacles) if(Math.hypot(x-o.x,y-o.y)<r+o.radius) return false; return true; }
    function canMoveTo(x,y,r=28) { return isWalkable(x,y,r) && canCrossBoundary(player.x,player.y,x,y); }
    
    // ========== МОБЫ ==========
    let mobs = [], spawnTimer = 0, MAX_MOBS = 48;
    function createMob() { let avail=mobTypes.filter(m=>player.level>=m.levelMin); if(avail.length===0) avail=mobTypes; let t=avail[Math.floor(Math.random()*avail.length)]; let lvl=Math.max(1,player.level+Math.floor(Math.random()*6)-3); let mult=currentWorld.mobMultiplier; let hpMult=1+(lvl-1)*0.16; let dmgMult=1+(lvl-1)*0.14; return { name:`${t.name} Lv.${lvl}`, level:lvl, hp:Math.floor(t.hp*hpMult*mult), maxHp:Math.floor(t.hp*hpMult*mult), dmg:Math.floor(t.dmg*dmgMult), exp:Math.floor(t.exp*(0.85+lvl*0.12)*mult), goldMin:Math.floor(t.goldMin*(0.8+lvl*0.05)), goldMax:Math.floor(t.goldMax*(0.9+lvl*0.07)), color:t.color, skin:t.skin, icon:t.icon, speed:t.speed, attackRange:t.range, x:0,y:0, attackTimer:0 }; }
    function spawnMob() { if(mobs.length>=MAX_MOBS) return; for(let a=0;a<80;a++) { let x=200+Math.random()*(WORLD_WIDTH-400), y=180+Math.random()*(WORLD_HEIGHT-360); if(isWalkable(x,y,30) && !isInSafeZone(x,y) && Math.hypot(x-player.x,y-player.y)>260) { let m=createMob(); m.x=x; m.y=y; mobs.push(m); return; } } }
    
    // ========== ПУТЬ ==========
    function findPath(sx,sy,tx,ty) { let path=[], dx=tx-sx, dy=ty-sy, dist=Math.hypot(dx,dy); if(dist<22) return path; let steps=Math.min(100,Math.floor(dist/15)); for(let i=1;i<=steps;i++) { let t=i/steps, nx=sx+dx*t, ny=sy+dy*t; if(canMoveTo(nx,ny,28)) path.push({x:nx,y:ny}); else { let ang=Math.atan2(dy,dx); for(let off of [-1.5,1.5,-2.3,2.3,-3.2,3.2]) { let nx2=sx+dx*t+Math.cos(ang+off)*58, ny2=sy+dy*t+Math.sin(ang+off)*58; if(canMoveTo(nx2,ny2,28)) { path.push({x:nx2,y:ny2}); break; } } } } path.push({x:tx,y:ty}); return path; }
    function moveTo(x,y) { player.targetX=x; player.targetY=y; player.path=findPath(player.x,player.y,x,y); }
    function updateMove() { if(!player.path||player.path.length===0) return; let next=player.path[0], dx=next.x-player.x, dy=next.y-player.y, dist=Math.hypot(dx,dy); if(dist<14) player.path.shift(); else { let step=Math.min(player.speed,dist), ang=Math.atan2(dy,dx), nx=player.x+Math.cos(ang)*step, ny=player.y+Math.sin(ang)*step; if(canMoveTo(nx,ny,28)) { player.x=nx; player.y=ny; } else { player.path=[]; player.targetX=null; } } }
    
    // ========== БОЙ ==========
    let selectedMob = null, messages = [], damageFloats = [], showStats = false, showInventory = false, shopOpen = false, bankOpen = false, shopCategory = "potions", explosionTarget = null, whirlwindActive = false, whirlwindTimer = 0;
    function addMsg(t,e=false) { messages.unshift({text:t,isErr:e,
