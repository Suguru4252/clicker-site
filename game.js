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
    function addMsg(t,e=false) { messages.unshift({text:t,isErr:e,life:220}); if(messages.length>7) messages.pop(); }
    function showDamage(x,y,dmg,isPlayer=false,isCrit=false) { damageFloats.push({x,y,dmg,life:26,isPlayer,isCrit}); }
    function calculateDamage() { let {min,max}=getDamageRange(); let dmg=Math.floor(Math.random()*(max-min+1)+min); let isCrit=Math.random()*100<player.critChance; if(isCrit) { dmg=Math.floor(dmg*1.9); stats.criticalHits++; } return {dmg,isCrit}; }
    function killMob(mob) { let expGain=mob.exp, goldGain=Math.floor(mob.goldMin+Math.random()*(mob.goldMax-mob.goldMin)); player.exp+=expGain; player.gold+=goldGain; stats.mobsKilled++; stats.totalGold+=goldGain; addMsg(`✨ +${expGain} опыта, +${goldGain}💰`); if(Math.random()<0.45) { if(Math.random()<0.6) inventory.potionHp++; else inventory.potionMp++; addMsg(`🧪 Выпало зелье!`); } if(Math.random()<0.18) { if(Math.random()<0.6) inventory.potionBigHp++; else inventory.potionBigMp++; addMsg(`✨ Выпало большое зелье!`); } let idx=mobs.indexOf(mob); if(idx!==-1) mobs.splice(idx,1); if(selectedMob===mob) selectedMob=null; while(player.exp>=player.expToNext) { player.exp-=player.expToNext; player.level++; updateGear(); player.hp=player.maxHp; player.mp=player.maxMp; player.expToNext=120+player.level*48; addMsg(`⭐⭐⭐⭐⭐ УРОВЕНЬ ${player.level}! ⭐⭐⭐⭐⭐`); } }
    function playerAttack() { if(!selectedMob||selectedMob.hp<=0) { selectedMob=null; return false; } if(player.attackTimer>0) return false; let dist=Math.hypot(player.x-selectedMob.x,player.y-selectedMob.y); let range=getAttackRange(); if(dist>range) { addMsg(`🏃 Слишком далеко! (${Math.floor(dist)}/${range}px)`,true); return false; } let {dmg,isCrit}=calculateDamage(); selectedMob.hp-=dmg; stats.totalDamage+=dmg; player.attackTimer=28; let cls=classes[player.classType]; addMsg(`⚔️ ${cls.name} → ${dmg} урона${isCrit?" (КРИТ!)":""} ${selectedMob.name}!`); showDamage(selectedMob.x,selectedMob.y,dmg,false,isCrit); if(selectedMob.hp<=0) killMob(selectedMob); return true; }
    function useSuper() { if(player.superCooldown>0) { addMsg(`🌟 Суперспособность: ${Math.ceil(player.superCooldown/10)} сек`,true); return; } let cls=classes[player.classType]; stats.skillsUsed++; if(cls.name==="Мечник") { whirlwindActive=true; whirlwindTimer=30; player.superCooldown=180; addMsg(`🌀 ВИХРЬ! Урон x2.2 по всем врагам!`); for(let mob of mobs) { if(Math.hypot(player.x-mob.x,player.y-mob.y)<110 && mob.hp>0) { let {min,max}=getDamageRange(), avg=(min+max)/2, dmg=Math.floor(avg*2.2); mob.hp-=dmg; stats.totalDamage+=dmg; showDamage(mob.x,mob.y,dmg,false,true); addMsg(`🌀 Вихрь → ${dmg} урона ${mob.name}!`); if(mob.hp<=0) killMob(mob); } } } else if(cls.name==="Лучник") { let targets=mobs.filter(m=>m.hp>0&&Math.hypot(player.x-m.x,player.y-m.y)<220); targets.sort((a,b)=>Math.hypot(player.x-a.x,player.y-a.y)-Math.hypot(player.x-b.x,player.y-b.y)); let hit=0; for(let mob of targets.slice(0,3)) { let {min,max}=getDamageRange(), avg=(min+max)/2, dmg=Math.floor(avg*3.2); mob.hp-=dmg; stats.totalDamage+=dmg; showDamage(mob.x,mob.y,dmg,false,true); addMsg(`🏹 Тройной выстрел → ${dmg} урона ${mob.name}!`); if(mob.hp<=0) killMob(mob); hit++; } if(hit===0) addMsg(`🏹 Нет врагов поблизости!`,true); else player.superCooldown=180; } else if(cls.name==="Маг") { addMsg(`🔥 Нажмите на любое место для взрыва!`); explosionTarget={active:true}; return; } if(explosionTarget?.active!==true) player.superCooldown=180; }
    function castExplosion(wx,wy) { if(!explosionTarget?.active) return false; explosionTarget=null; let {min,max}=getDamageRange(), avg=(min+max)/2, dmg=Math.floor(avg*2.8), hit=false; for(let mob of mobs) { if(Math.hypot(wx-mob.x,wy-mob.y)<100 && mob.hp>0) { mob.hp-=dmg; stats.totalDamage+=dmg; showDamage(mob.x,mob.y,dmg,false,true); addMsg(`🔥 Взрыв → ${dmg} урона ${mob.name}!`); if(mob.hp<=0) killMob(mob); hit=true; } } damageFloats.push({x:wx,y:wy,dmg:"💥",life:22,isExplosion:true}); if(!hit) addMsg(`🔥 Взрыв не задел врагов!`,true); player.superCooldown=180; return true; }
    
    // ========== МОБЫ АТАКУЮТ ==========
    function updateMobs() { for(let m of mobs) { if(m.hp<=0) continue; let dx=player.x-m.x, dy=player.y-m.y, dist=Math.hypot(dx,dy); if(dist<280 && !isInSafeZone(player.x,player.y)) { let ang=Math.atan2(dy,dx), step=Math.min(m.speed,dist-60); if(step>0) { let nx=m.x+Math.cos(ang)*step, ny=m.y+Math.sin(ang)*step; if(isWalkable(nx,ny,30)&&!isInSafeZone(nx,ny)) { m.x=nx; m.y=ny; } } if(dist<m.attackRange+22) { if(m.attackTimer<=0) { let dodge=Math.random()*100<player.dodgeChance; if(dodge) { stats.dodges++; addMsg(`✨ УВОРОТ! ${m.name} промахнулся!`,false); m.attackTimer=30; continue; } let dmg=Math.max(7,m.dmg-Math.floor(player.defense/4.5)); player.hp-=dmg; stats.totalDamageTaken+=dmg; m.attackTimer=30; addMsg(`💀 ${m.name} нанес ${dmg} урона!`,true); showDamage(m.x,m.y,dmg,true); if(player.hp<=0) { player.hp=player.maxHp; player.mp=player.maxMp; player.x=safeZone.x+safeZone.width/2; player.y=safeZone.y+safeZone.height/2; player.path=[]; player.targetX=null; addMsg(`💀 ВОСКРЕШЕНИЕ В БЕЗОПАСНОЙ ЗОНЕ 💀`,true); } } else m.attackTimer--; } else if(m.attackTimer>0) m.attackTimer--; } else if(m.attackTimer>0) m.attackTimer--; } }
    
    // ========== ЗЕЛЬЯ ==========
    function useHp() { if(!isInSafeZone(player.x,player.y)) { addMsg(`🏪 Зелья только в безопасной зоне!`,true); return; } if(inventory.potionHp<=0 && inventory.potionBigHp<=0) { addMsg(`❌ Нет зелий HP! Купите у торговца`,true); return; } stats.potionsUsed++; if(inventory.potionBigHp>0 && player.hp<player.maxHp*0.5) { let heal=Math.floor(player.maxHp*0.95); player.hp=Math.min(player.maxHp,player.hp+heal); inventory.potionBigHp--; addMsg(`❤️❤️ БОЛЬШОЕ ЗЕЛЬЕ! +${heal} HP`); } else if(inventory.potionHp>0) { let heal=Math.floor(player.maxHp*0.72); player.hp=Math.min(player.maxHp,player.hp+heal); inventory.potionHp--; addMsg(`❤️ +${heal} HP`); } else addMsg(`❌ Нет малых зелий!`,true); }
    function useMp() { if(!isInSafeZone(player.x,player.y)) { addMsg(`🏪 Зелья только в безопасной зоне!`,true); return; } if(inventory.potionMp<=0 && inventory.potionBigMp<=0) { addMsg(`❌ Нет зелий MP! Купите у торговца`,true); return; } stats.potionsUsed++; if(inventory.potionBigMp>0 && player.mp<player.maxMp*0.5) { let mana=Math.floor(player.maxMp); player.mp=Math.min(player.maxMp,player.mp+mana); inventory.potionBigMp--; addMsg(`💙💙 БОЛЬШОЕ ЗЕЛЬЕ! +${mana} MP`); } else if(inventory.potionMp>0) { let mana=Math.floor(player.maxMp*0.78); player.mp=Math.min(player.maxMp,player.mp+mana); inventory.potionMp--; addMsg(`💙 +${mana} MP`); } else addMsg(`❌ Нет малых зелий!`,true); }
    
    // ========== NPC ==========
    const SHOP_POTIONS = [{name:"Зелье HP",type:"hp",price:55,icon:"❤️"},{name:"Зелье MP",type:"mp",price:50,icon:"💙"},{name:"Большое HP",type:"hp_big",price:160,icon:"❤️✨"},{name:"Большое MP",type:"mp_big",price:150,icon:"💙✨"}];
    function openShop() { if(isInSafeZone(player.x,player.y)) { shopOpen=!shopOpen; bankOpen=false; addMsg(shopOpen?"🏪 Магазин открыт":"🏪 Магазин закрыт"); } else addMsg(`🏪 Подойдите к торговцу!`,true); }
    function openBank() { if(isInSafeZone(player.x,player.y)) { bankOpen=!bankOpen; shopOpen=false; addMsg(bankOpen?"🏦 Банк открыт":"🏦 Банк закрыт"); } else addMsg(`🏦 Подойдите к банкиру!`,true); }
    function healFromNPC() { if(isInSafeZone(player.x,player.y)) { let cost=Math.floor(player.maxHp*0.45); if(player.gold>=cost) { player.gold-=cost; player.hp=player.maxHp; player.mp=player.maxMp; addMsg(`💚 Полное восстановление! -${cost}💰`); } else addMsg(`💰 Не хватает золота! Нужно ${cost}`,true); } else addMsg(`💚 Подойдите к лекарю!`,true); }
    function changeWorld() { if(isInSafeZone(player.x,player.y)) { let worldIds = Object.keys(worlds); let idx = worldIds.indexOf(currentWorldId); currentWorldId = worldIds[(idx+1)%worldIds.length]; currentWorld = worlds[currentWorldId]; addMsg(`🌍 Переход в мир: ${currentWorld.name} ${currentWorld.icon}`); for(let i=0;i<10;i++) spawnMob(); } else addMsg(`🌍 Подойдите к порталу в безопасной зоне!`,true); }
    function buyItem(item) { if(player.gold>=item.price) { player.gold-=item.price; if(item.type==="hp") inventory.potionHp++; else if(item.type==="mp") inventory.potionMp++; else if(item.type==="hp_big") inventory.potionBigHp++; else if(item.type==="mp_big") inventory.potionBigMp++; else if(item.type==="armor" && player.level>=item.level) { inventory.armorId=item.id; updateGear(); addMsg(`🛡️ Куплена ${item.name}!`); } else if(item.type==="weapon" && player.level>=item.level) { inventory.weaponId=item.id; updateGear(); addMsg(`⚔️ Куплено ${item.name}!`); } else if((item.type==="armor"||item.type==="weapon") && player.level<item.level) { addMsg(`❌ Требуется уровень ${item.level}!`,true); player.gold+=item.price; return; } addMsg(`✅ Куплен ${item.name}!`); } else addMsg(`💰 Не хватает золота!`,true); }
    function depositGold() { let amount=Math.min(player.gold,200); if(amount>0) { player.gold-=amount; player.bankGold+=amount; addMsg(`🏦 Внесено ${amount}💰. Баланс: ${player.bankGold}`); } else addMsg(`💰 Нет золота!`,true); }
    function withdrawGold() { let amount=Math.min(player.bankGold,200); if(amount>0) { player.bankGold-=amount; player.gold+=amount; addMsg(`🏦 Снято ${amount}💰. Баланс: ${player.bankGold}`); } else addMsg(`🏦 Нет средств!`,true); }
    function switchClass() { let classIds = Object.keys(classes); let idx = classIds.indexOf(player.classType); let newC = classIds[(idx+1)%classIds.length]; let hpPercent=player.hp/player.maxHp, mpPercent=player.mp/player.maxMp; player.classType=newC; updateGear(); player.hp=Math.max(1,Math.min(player.maxHp,Math.floor(player.maxHp*hpPercent))); player.mp=Math.max(1,Math.min(player.maxMp,Math.floor(player.maxMp*mpPercent))); addMsg(`🔄 Класс: ${classes[newC].name} ${classes[newC].icon}`); }
    
    // ========== ВЗАИМОДЕЙСТВИЕ ==========
    function isClickOnNPC(wx,wy) { if(Math.hypot(wx-npcs.shop.x,wy-npcs.shop.y)<38) { openShop(); return true; } if(Math.hypot(wx-npcs.healer.x,wy-npcs.healer.y)<38) { healFromNPC(); return true; } if(Math.hypot(wx-npcs.banker.x,wy-npcs.banker.y)<38) { openBank(); return true; } if(Math.hypot(wx-npcs.worldPortal.x,wy-npcs.worldPortal.y)<38) { changeWorld(); return true; } return false; }
    function selectMobAt(wx,wy) { for(let m of mobs) if(Math.hypot(m.x-wx,m.y-wy)<70 && m.hp>0) { selectedMob=m; addMsg(`🎯 Цель: ${m.name} (${m.hp}/${m.maxHp} HP) Lv.${m.level}`); return true; } return false; }
    function handleClick(wx,wy) { if(showStats||showInventory) { showStats=false; showInventory=false; return; } if(shopOpen) { let cx=canvasWidth/2, cy=canvasHeight/2-80; for(let i=0;i<SHOP_POTIONS.length;i++) { let y=cy-30+i*70; if(wy>cameraY+y-25 && wy<cameraY+y+50) { buyItem(SHOP_POTIONS[i]); return; } } for(let i=0;i<armors.length;i++) { let y=cy+220+i*55; if(wy>cameraY+y-25 && wy<cameraY+y+45) { buyItem({...armors[i], type:"armor"}); return; } } for(let i=0;i<weapons.length;i++) { let y=cy+220+armors.length*55+i*55; if(wy>cameraY+y-25 && wy<cameraY+y+45) { buyItem({...weapons[i], type:"weapon"}); return; } } shopOpen=false; return; } if(bankOpen) { let cx=canvasWidth/2, cy=canvasHeight/2-60; if(wy>cameraY+cy-20 && wy<cameraY+cy+60) { depositGold(); return; } if(wy>cameraY+cy+80 && wy<cameraY+cy+160) { withdrawGold(); return; } bankOpen=false; return; } if(explosionTarget?.active) { castExplosion(wx,wy); return; } if(isClickOnNPC(wx,wy)) return; if(selectMobAt(wx,wy)) return; moveTo(wx,wy); }
    
    // ========== КАМЕРА ==========
    function updateCamera() { let tx=player.x-canvasWidth/2, ty=player.y-canvasHeight/2; tx=Math.min(Math.max(tx,0),WORLD_WIDTH-canvasWidth); ty=Math.min(Math.max(ty,0),WORLD_HEIGHT-canvasHeight); cameraX+=(tx-cameraX)*0.12; cameraY+=(ty-cameraY)*0.12; }
    
    // ========== ОТРИСОВКА ==========
    function drawWorld() { let w=currentWorld; for(let i=0;i<WORLD_WIDTH/58+12;i++) for(let j=0;j<WORLD_HEIGHT/58+12;j++) { let x=i*58-cameraX, y=j*58-cameraY; if(x>-90 && x<canvasWidth+90 && y>-90 && y<canvasHeight+90) { ctx.fillStyle=((i+j)%2===0)?w.floor1:w.floor2; ctx.fillRect(x,y,57,57); if((i+j)%3===0) { ctx.fillStyle="#b8d98c"; ctx.fillRect(x+20,y+25,4,4); } } } for(let o of obstacles) { let x=o.x-cameraX, y=o.y-cameraY; if(x>-180 && x<canvasWidth+180 && y>-180 && y<canvasHeight+180) { if(o.type==='tree') { ctx.fillStyle="#3c9e3c"; ctx.fillRect(x-24,y-44,48,78); ctx.fillStyle="#8b5a2b"; ctx.fillRect(x-16,y-14,32,48); ctx.fillStyle="#5aac3a"; ctx.beginPath(); ctx.ellipse(x,y-58,38,42,0,0,Math.PI*2); ctx.fill(); } else if(o.type==='mountain') { ctx.fillStyle="#6e6e7a"; ctx.beginPath(); ctx.moveTo(x,y-64); ctx.lineTo(x-56,y+22); ctx.lineTo(x+56,y+22); ctx.fill(); ctx.fillStyle="#8e8e9a"; ctx.beginPath(); ctx.moveTo(x-18,y-22); ctx.lineTo(x,y-52); ctx.lineTo(x+18,y-22); ctx.fill(); } else if(o.type==='rock') { ctx.fillStyle="#7a6a5a"; ctx.beginPath(); ctx.ellipse(x,y,24,20,0,0,Math.PI*2); ctx.fill(); } else if(o.type==='fence') { ctx.fillStyle="#c99e6f"; ctx.fillRect(x-16,y-20,32,48); for(let i=0;i<3;i++) ctx.fillRect(x-12+i*12,y-34,6,26); } else if(o.type==='bush') { ctx.fillStyle="#5a9e4a"; ctx.beginPath(); ctx.ellipse(x,y,20,18,0,0,Math.PI*2); ctx.fill(); } else if(o.type==='river') { ctx.fillStyle="#3a8cbb"; ctx.beginPath(); ctx.ellipse(x,y,30,24,0,0,Math.PI*2); ctx.fill(); ctx.fillStyle="#5ac8ff"; ctx.beginPath(); ctx.ellipse(x-8,y-4,14,12,0,0,Math.PI*2); ctx.fill(); } } } let szX=safeZone.x-cameraX, szY=safeZone.y-cameraY; ctx.fillStyle="#88aa66aa"; ctx.fillRect(szX,szY,safeZone.width,safeZone.height); for(let n in npcs) { let npc=npcs[n]; let nx=npc.x-cameraX, ny=npc.y-cameraY; ctx.fillStyle="#c99e6f"; ctx.fillRect(nx-24,ny-36,48,64); ctx.fillStyle="#e8c28a"; ctx.fillRect(nx-18,ny-26,36,46); ctx.fillStyle="#000"; ctx.fillRect(nx-12,ny-18,8,8); ctx.fillRect(nx+4,ny-18,8,8); ctx.font="32px monospace"; ctx.fillStyle="#ffdd99"; ctx.fillText(npc.icon,nx-18,ny+2); ctx.font="10px monospace"; ctx.fillStyle="#ffffaa"; ctx.fillText(npc.name,nx-24,ny-40); } for(let g of gates) { let gx=g.x-cameraX, gy=g.y-cameraY; ctx.fillStyle="#c9a87a"; ctx.fillRect(gx,gy,g.width,g.height); ctx.fillStyle="#e8c28a"; if(g.width>g.height) for(let i=0;i<3;i++) ctx.fillRect(gx+22+i*36,gy+18,18,28); else for(let i=0;i<3;i++) ctx.fillRect(gx+18,gy+22+i*36,28,18); } }
    function drawPlayer() { let x=player.x-cameraX, y=player.y-cameraY, cls=classes[player.classType]; ctx.fillStyle="#e0c8a0"; ctx.fillRect(x-22,y-34,44,62); ctx.fillStyle=cls.color; ctx.fillRect(x-20,y-26,40,48); ctx.fillStyle=cls.armorColor; ctx.fillRect(x-18,y-16,36,36); ctx.fillStyle="#fff"; ctx.fillRect(x-14,y-28,9,9); ctx.fillRect(x+5,y-28,9,9); ctx.fillStyle="#000"; ctx.fillRect(x-13,y-27,7,7); ctx.fillRect(x+6,y-27,7,7); ctx.font=`${Math.min(34,canvasWidth/24)}px monospace`; ctx.fillStyle="#ffffaa"; ctx.fillText(cls.icon,x-18,y+4); ctx.fillStyle="#a33"; ctx.fillRect(x-36,y-54,88,14); ctx.fillStyle="#4f6"; ctx.fillRect(x-36,y-54,88*(player.hp/player.maxHp),14); ctx.fillStyle="#58f"; ctx.fillRect(x-36,y-70,88*(player.mp/player.maxMp),10); if(whirlwindActive) { ctx.fillStyle="#ffaa44aa"; ctx.beginPath(); ctx.arc(x,y,64,0,Math.PI*2); ctx.fill(); whirlwindTimer--; if(whirlwindTimer<=0) whirlwindActive=false; } }
    function drawMob(m) { let x=m.x-cameraX, y=m.y-cameraY; if(x<-150||x>canvasWidth+150) return; ctx.fillStyle=m.skin; ctx.fillRect(x-22,y-34,44,62); ctx.fillStyle=m.color; ctx.fillRect(x-20,y-26,40,48); ctx.fillStyle="#000"; ctx.fillRect(x-14,y-28,8,8); ctx.fillRect(x+6,y-28,8,8); ctx.font=`${Math.min(34,canvasWidth/24)}px monospace`; ctx.fillStyle="#fff"; ctx.fillText(m.icon,x-16,y+2); let percent=m.hp/m.maxHp; ctx.fillStyle="#a33"; ctx.fillRect(x-36,y-54,88,9); ctx.fillStyle="#4f6"; ctx.fillRect(x-36,y-54,88*percent,9); ctx.font="11px monospace"; ctx.fillStyle="#ffffaa"; ctx.fillText(`Lv.${m.level}`,x-18,y-60); }
    function drawUI() { let cls=classes[player.classType], fs=Math.max(14,Math.min(18,canvasWidth/48)); ctx.fillStyle="#000000aa"; ctx.fillRect(12,12,300,128); ctx.fillStyle="#c55"; ctx.fillRect(18,20,280,28); ctx.fillStyle="#f75"; ctx.fillRect(18,20,280*(player.hp/player.maxHp),28); ctx.fillStyle="#58f"; ctx.fillRect(18,56,280*(player.mp/player.maxMp),24); ctx.fillStyle="#fff"; ctx.font=`bold ${fs}px monospace`; ctx.fillText(`❤️ ${Math.floor(player.hp)}/${player.maxHp}`,22,44); ctx.fillText(`💙 ${Math.floor(player.mp)}/${player.maxMp}`,22,78); ctx.fillStyle="#fd9"; ctx.font=`bold ${fs+2}px monospace`; ctx.fillText(`${cls.name} ${cls.icon} Lv.${player.level}`,22,110); ctx.fillStyle="#000000aa"; ctx.fillRect(12,148,300,22); ctx.fillStyle="#8af"; ctx.fillRect(12,148,300*(player.exp/player.expToNext),22); ctx.fillStyle="#fff"; ctx.font=`${fs-2}px monospace`; ctx.fillText(`EXP: ${player.exp}/${player.expToNext}`,18,168); ctx.fillStyle="#000000aa"; ctx.fillRect(canvasWidth-190,12,178,88); ctx.fillStyle="#fc8"; ctx.font=`bold ${fs}px monospace`; ctx.fillText(`💰 ${player.gold}`,canvasWidth-180,38); ctx.fillText(`🏦 ${player.bankGold}`,canvasWidth-180,68); ctx.fillText(`🌍 ${currentWorld.name}`,canvasWidth-180,98); for(let i=0;i<Math.min(6,messages.length);i++) { let m=messages[i]; ctx.fillStyle=m.isErr?"#f86c":"#edbc"; ctx.font=`${fs-2}px monospace`; ctx.fillText(m.text.substring(0,44),15,canvasHeight-75-i*22); } if(selectedMob&&selectedMob.hp>0) { let x=selectedMob.x-cameraX, y=selectedMob.y-cameraY; ctx.strokeStyle="#fa4"; ctx.lineWidth=4; ctx.strokeRect(x-26,y-42,76,76); } if(player.targetX&&player.path&&player.path.length>0) { let tx=player.targetX-cameraX, ty=player.targetY-cameraY; ctx.fillStyle="#fc4a"; ctx.beginPath(); ctx.arc(tx,ty,22,0,Math.PI*2); ctx.fill(); ctx.fillStyle="#fa0"; ctx.beginPath(); ctx.arc(tx,ty,14,0,Math.PI*2); ctx.fill(); } for(let i=0;i<damageFloats.length;i++) { let d=damageFloats[i], x=d.x-cameraX, y=d.y-cameraY; if(d.isExplosion) { ctx.font="bold 44px monospace"; ctx.fillStyle="#ff8844"; ctx.fillText("💥",x-22,y-34); } else { ctx.font=`bold ${d.isPlayer?24:28}px monospace`; ctx.fillStyle=d.isCrit?"#ffaa44":(d.isPlayer?"#fa6":"#f84"); ctx.fillText(d.isCrit?`⚡${d.dmg}⚡`:`-${d.dmg}`,x-18,y-40); } d.life--; if(d.life<=0) damageFloats.splice(i,1),i--; } if(shopOpen&&isInSafeZone(player.x,player.y)) { ctx.fillStyle="#000000dd"; ctx.fillRect(canvasWidth/2-280,canvasHeight/2-240,560,480); ctx.fillStyle="#fd9"; ctx.font=`bold ${Math.min(28,canvasWidth/24)}px monospace`; ctx.fillText("🏪 МАГАЗИН",canvasWidth/2-100,canvasHeight/2-190); ctx.font="12px monospace"; ctx.fillStyle="#cca"; ctx.fillText("ЗЕЛЬЯ",canvasWidth/2-260,canvasHeight/2-140); for(let i=0;i<SHOP_POTIONS.length;i++) { let it=SHOP_POTIONS[i], y=canvasHeight/2-120+i*65; ctx.fillStyle="#a86"; ctx.fillRect(canvasWidth/2-260,y-10,240,48); ctx.fillStyle="#fc8"; ctx.font="14px monospace"; ctx.fillText(`${it.icon} ${it.name} - ${it.price}💰`,canvasWidth/2-240,y+12); } ctx.fillStyle="#cca"; ctx.fillText("БРОНЯ",canvasWidth/2+40,canvasHeight/2-140); for(let i=0;i<armors.length;i++) { let it=armors[i], y=canvasHeight/2-120+i*55; ctx.fillStyle="#a86"; ctx.fillRect(canvasWidth/2+20,y-10,240,44); ctx.fillStyle="#fc8"; ctx.font="12px monospace"; ctx.fillText(`${it.icon} ${it.name} (Ур.${it.level}) +${it.def} - ${it.price}💰`,canvasWidth/2+40,y+10); } ctx.fillStyle="#cca"; ctx.fillText("ОРУЖИЕ",canvasWidth/2+40,canvasHeight/2+180); for(let i=0;i<weapons.length;i++) { let it=weapons[i], y=canvasHeight/2+200+i*55; ctx.fillStyle="#a86"; ctx.fillRect(canvasWidth/2+20,y-10,240,44); ctx.fillStyle="#fc8"; ctx.font="12px monospace"; ctx.fillText(`${it.icon} ${it.name} (Ур.${it.level}) ${it.dmgMin}-${it.dmgMax} - ${it.price}💰`,canvasWidth/2+40,y+10); } } if(bankOpen&&isInSafeZone(player.x,player.y)) { ctx.fillStyle="#000000dd"; ctx.fillRect(canvasWidth/2-240,canvasHeight/2-170,480,340); ctx.fillStyle="#fd9"; ctx.font=`bold ${Math.min(28,canvasWidth/24)}px monospace`; ctx.fillText("🏦 БАНК",canvasWidth/2-65,canvasHeight/2-100); ctx.fillStyle="#a86"; ctx.fillRect(canvasWidth/2-180,canvasHeight/2-30,360,60); ctx.fillStyle="#fc8"; ctx.font="18px monospace"; ctx.fillText(`💰 Внести 200💰`,canvasWidth/2-130,canvasHeight/2+2); ctx.fillStyle="#a86"; ctx.fillRect(canvasWidth/2-180,canvasHeight/2+55,360,60); ctx.fillStyle="#fc8"; ctx.fillText(`🏦 Снять 200💰`,canvasWidth/2-130,canvasHeight/2+87); ctx.fillStyle="#ffdd99"; ctx.font="16px monospace"; ctx.fillText(`Ваш счет: ${player.bankGold}💰`,canvasWidth/2-85,canvasHeight/2+150); } if(showStats) { let t=getPlayTime(); ctx.fillStyle="#000000dd"; ctx.fillRect(canvasWidth/2-280,canvasHeight/2-250,560,500); ctx.fillStyle="#fd9"; ctx.font=`bold ${Math.min(30,canvasWidth/22)}px monospace`; ctx.fillText("📊 СТАТИСТИКА",canvasWidth/2-120,canvasHeight/2-180); ctx.font=`${Math.min(18,canvasWidth/34)}px monospace`; ctx.fillStyle="#edb"; let y=canvasHeight/2-100; ctx.fillText(`👾 Убито мобов: ${stats.mobsKilled}`,canvasWidth/2-240,y); ctx.fillText(`💰 Всего золота: ${stats.totalGold}`,canvasWidth/2-240,y+38); ctx.fillText(`⚔️ Нанесено урона: ${stats.totalDamage}`,canvasWidth/2-240,y+76); ctx.fillText(`🛡️ Получено урона: ${stats.totalDamageTaken}`,canvasWidth/2-240,y+114); ctx.fillText(`⚡ Криты: ${stats.criticalHits}`,canvasWidth/2-240,y+152); ctx.fillText(`✨ Увороты: ${stats.dodges}`,canvasWidth/2-240,y+190); ctx.fillText(`🌟 Суперсилы: ${stats.skillsUsed}`,canvasWidth/2-240,y+228); ctx.fillText(`🧪 Зелий: ${stats.potionsUsed}`,canvasWidth/2-240,y+266); ctx.fillText(`⏱️ Время: ${t.h}ч ${t.m}м ${t.s}с`,canvasWidth/2-240,y+304); } if(showInventory) { ctx.fillStyle="#000000dd"; ctx.fillRect(canvasWidth/2-260,canvasHeight/2-250,520,500); ctx.fillStyle="#fd9"; ctx.font=`bold ${Math.min(30,canvasWidth/24)}px monospace`; ctx.fillText("🎒 ИНВЕНТАРЬ",canvasWidth/2-100,canvasHeight/2-180); ctx.font=`${Math.min(16,canvasWidth/36)}px monospace`; ctx.fillStyle="#edb"; let y=canvasHeight/2-110; ctx.fillText(`🧪 Малые HP: ${inventory.potionHp}`,canvasWidth/2-220,y); ctx.fillText(`💙 Малые MP: ${inventory.potionMp}`,canvasWidth/2-220,y+32); ctx.fillText(`✨ Большие HP: ${inventory.potionBigHp}`,canvasWidth/2-220,y+64); ctx.fillText(`✨ Большие MP: ${inventory.potionBigMp}`,canvasWidth/2-220,y+96); ctx.fillText(`🛡️ ${inventory.armor.name} +${inventory.armor.def}`,canvasWidth/2-220,y+138); ctx.fillText(`⚔️ ${inventory.weapon.name} ${inventory.weapon.dmgMin}-${inventory.weapon.dmgMax}`,canvasWidth/2-220,y+170); ctx.fillStyle="#fda"; ctx.fillText(`💰 Золото: ${player.gold}`,canvasWidth/2-220,y+212); ctx.fillStyle="#8af"; ctx.fillText(`⭐ Уровень: ${player.level}`,canvasWidth/2-220,y+244); ctx.fillStyle="#4f6"; ctx.fillText(`🛡️ Защита: ${Math.floor(player.defense)}`,canvasWidth/2-220,y+276); ctx.fillStyle="#fa4"; ctx.fillText(`🎯 Крит: ${player.critChance}% | Уворот: ${player.dodgeChance}%`,canvasWidth/2-220,y+308); } if(player.superCooldown>0) { let p=player.superCooldown/180; ctx.fillStyle="#000000aa"; ctx.fillRect(15,canvasHeight-85,90,16); ctx.fillStyle="#ffaa44"; ctx.fillRect(15,canvasHeight-85,90*(1-p),16); ctx.fillStyle="#ffaa88"; ctx.font="12px monospace"; ctx.fillText(`🌟 ${Math.ceil(player.superCooldown/10)}с`,22,canvasHeight-66); } ctx.fillStyle="#ffffffaa"; ctx.font="11px monospace"; ctx.fillText(`⚔️ Урон: ${getDamageRange().min}-${getDamageRange().max}`,canvasWidth-170,canvasHeight-30); ctx.fillText(`🎯 Дальность: ${getAttackRange()}px`,canvasWidth-170,canvasHeight-15); }
    
    // ========== ОБНОВЛЕНИЕ ==========
    function update() { updateMove(); updateMobs(); updateCamera(); if(player.attackTimer>0) player.attackTimer--; if(player.superCooldown>0) player.superCooldown--; if(spawnTimer<=0) { if(mobs.length<MAX_MOBS) for(let i=0;i<2;i++) spawnMob(); spawnTimer=14; } else spawnTimer--; for(let i=0;i<messages.length;i++) if(messages[i].life) messages[i].life--; messages=messages.filter(m=>!m.life||m.life>0); }
    
    // ========== УПРАВЛЕНИЕ ==========
    function getWorldClick(cx,cy) { let rect=canvas.getBoundingClientRect(), sx=canvasWidth/rect.width, sy=canvasHeight/rect.height; return { x:(cx-rect.left)*sx+cameraX, y:(cy-rect.top)*sy+cameraY }; }
    canvas.addEventListener('click',(e)=>{ let w=getWorldClick(e.clientX,e.clientY); handleClick(w.x,w.y); });
    canvas.addEventListener('touchstart',(e)=>{ e.preventDefault(); let t=e.touches[0]; let w=getWorldClick(t.clientX,t.clientY); handleClick(w.x,w.y); });
    setInterval(()=>{ if(selectedMob&&selectedMob.hp>0&&Math.hypot(player.x-selectedMob.x,player.y-selectedMob.y)<=getAttackRange()+22) playerAttack(); },2000);
    document.getElementById('superBtn').addEventListener('click',()=>useSuper());
    document.getElementById('hpBtn').addEventListener('click',()=>useHp());
    document.getElementById('mpBtn').addEventListener('click',()=>useMp());
    document.getElementById('statsBtn').addEventListener('click',()=>{ showStats=!showStats; showInventory=false; });
    document.getElementById('inventoryBtn').addEventListener('click',()=>{ showInventory=!showInventory; showStats=false; });
    window.addEventListener('keydown',(e)=>{ if(e.key==='e') useSuper(); if(e.key==='q') useHp(); if(e.key==='w') useMp(); if(e.key==='c') switchClass(); });
    
    // ========== СТАРТ ==========
    function init() { generateWorld(); player.x=safeZone.x+safeZone.width/2; player.y=safeZone.y+safeZone.height/2; updateGear(); player.hp=player.maxHp; player.mp=player.maxMp; for(let i=0;i<18;i++) spawnMob(); addMsg("✨ ДОБРО ПОЖАЛОВАТЬ! ПОЛНАЯ ВЕРСИЯ ✨"); addMsg("🗡️ Нажмите на моба → автоатака раз в 2 сек"); addMsg("🌟 Суперспособность: 🌟 слева (КД 18 сек)"); addMsg("🏪 NPC: Торговец 🏪 | Лекарь 💚 | Банкир 🏦 | Портал миров 🌍"); addMsg("🛡️ Вся броня и оружие доступны в магазине!"); }
    init();
    
    function render() { drawWorld(); for(let m of mobs) drawMob(m); drawPlayer(); drawUI(); }
    function loop() { update(); render(); requestAnimationFrame(loop); }
    loop();
})();
