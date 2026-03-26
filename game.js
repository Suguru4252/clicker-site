(async function() {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // Размер клетки
    const TILE_SIZE = 50;
    
    // Загрузка данных
    const [worlds, armors, weapons, mobTypes, classes] = await Promise.all([
        fetch('data/worlds.json').then(r => r.json()),
        fetch('data/armors.json').then(r => r.json()),
        fetch('data/weapons.json').then(r => r.json()),
        fetch('data/mobs.json').then(r => r.json()),
        fetch('data/classes.json').then(r => r.json())
    ]);
    
    // ========== РАЗМЕР МИРА (в клетках) ==========
    const MAP_WIDTH = 140;
    const MAP_HEIGHT = 110;
    const WORLD_WIDTH = MAP_WIDTH * TILE_SIZE;
    const WORLD_HEIGHT = MAP_HEIGHT * TILE_SIZE;
    
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
    
    // ========== КАРТА КЛЕТОК ==========
    let tileMap = Array(MAP_HEIGHT).fill().map(() => Array(MAP_WIDTH).fill(0));
    let obstacles = [];
    
    // Типы клеток
    const TILE_EMPTY = 0;
    const TILE_SAFE = 1;
    const TILE_GATE = 2;
    const TILE_TREE = 3;
    const TILE_MOUNTAIN = 4;
    const TILE_WATER = 5;
    const TILE_ROCK = 6;
    
    // Генерация мира на клетках
    function generateWorld() {
        tileMap = Array(MAP_HEIGHT).fill().map(() => Array(MAP_WIDTH).fill(TILE_EMPTY));
        obstacles = [];
        
        // Безопасная зона
        for(let y = 12; y < 23; y++) {
            for(let x = 14; x < 29; x++) {
                tileMap[y][x] = TILE_SAFE;
            }
        }
        
        // Ворота в безопасной зоне (4 стороны)
        for(let x = 19; x < 24; x++) tileMap[11][x] = TILE_GATE;
        for(let x = 19; x < 24; x++) tileMap[23][x] = TILE_GATE;
        for(let y = 16; y < 21; y++) tileMap[y][13] = TILE_GATE;
        for(let y = 16; y < 21; y++) tileMap[y][29] = TILE_GATE;
        
        // Деревья (на клетках)
        for(let i = 0; i < 400; i++) {
            let x = 2 + Math.floor(Math.random() * (MAP_WIDTH - 4));
            let y = 2 + Math.floor(Math.random() * (MAP_HEIGHT - 4));
            if(tileMap[y][x] === TILE_EMPTY && !(y > 11 && y < 24 && x > 13 && x < 30)) {
                tileMap[y][x] = TILE_TREE;
                obstacles.push({ x: x * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2, radius: 22, type: 'tree' });
            }
        }
        
        // Горы
        for(let i = 0; i < 90; i++) {
            let x = 2 + Math.floor(Math.random() * (MAP_WIDTH - 4));
            let y = 2 + Math.floor(Math.random() * (MAP_HEIGHT - 4));
            if(tileMap[y][x] === TILE_EMPTY && !(y > 11 && y < 24 && x > 13 && x < 30)) {
                tileMap[y][x] = TILE_MOUNTAIN;
                obstacles.push({ x: x * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2, radius: 28, type: 'mountain' });
            }
        }
        
        // Вода (реки)
        for(let r = 0; r < 15; r++) {
            let startX = 10 + Math.floor(Math.random() * (MAP_WIDTH - 20));
            let startY = 8 + Math.floor(Math.random() * (MAP_HEIGHT - 16));
            let angle = Math.random() * Math.PI * 2;
            let length = 12 + Math.floor(Math.random() * 25);
            for(let s = 0; s < length; s++) {
                let x = startX + Math.floor(Math.cos(angle) * s);
                let y = startY + Math.floor(Math.sin(angle) * s);
                if(x > 1 && x < MAP_WIDTH-1 && y > 1 && y < MAP_HEIGHT-1 && tileMap[y][x] === TILE_EMPTY) {
                    tileMap[y][x] = TILE_WATER;
                    obstacles.push({ x: x * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2, radius: 20, type: 'river' });
                }
            }
        }
        
        // Камни
        for(let i = 0; i < 220; i++) {
            let x = 1 + Math.floor(Math.random() * (MAP_WIDTH - 2));
            let y = 1 + Math.floor(Math.random() * (MAP_HEIGHT - 2));
            if(tileMap[y][x] === TILE_EMPTY && !(y > 11 && y < 24 && x > 13 && x < 30)) {
                tileMap[y][x] = TILE_ROCK;
                obstacles.push({ x: x * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2, radius: 14, type: 'rock' });
            }
        }
        
        // Заборы вокруг безопасной зоны
        for(let x = 14; x < 29; x++) {
            if(tileMap[11][x] !== TILE_GATE) {
                obstacles.push({ x: x * TILE_SIZE + TILE_SIZE/2, y: 11 * TILE_SIZE + TILE_SIZE/2, radius: 14, type: 'fence' });
            }
            if(tileMap[23][x] !== TILE_GATE) {
                obstacles.push({ x: x * TILE_SIZE + TILE_SIZE/2, y: 23 * TILE_SIZE + TILE_SIZE/2, radius: 14, type: 'fence' });
            }
        }
        for(let y = 12; y < 23; y++) {
            if(tileMap[y][13] !== TILE_GATE) {
                obstacles.push({ x: 13 * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2, radius: 14, type: 'fence' });
            }
            if(tileMap[y][29] !== TILE_GATE) {
                obstacles.push({ x: 29 * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2, radius: 14, type: 'fence' });
            }
        }
    }
    
    // Проверка проходимости клетки
    function isTileWalkable(tileX, tileY) {
        if(tileX < 0 || tileX >= MAP_WIDTH || tileY < 0 || tileY >= MAP_HEIGHT) return false;
        let tile = tileMap[tileY][tileX];
        if(tile === TILE_TREE || tile === TILE_MOUNTAIN || tile === TILE_WATER || tile === TILE_ROCK) return false;
        return true;
    }
    
    // A* алгоритм поиска пути
    function findPathAStar(startX, startY, targetX, targetY) {
        let start = { x: Math.floor(startX / TILE_SIZE), y: Math.floor(startY / TILE_SIZE) };
        let target = { x: Math.floor(targetX / TILE_SIZE), y: Math.floor(targetY / TILE_SIZE) };
        
        if(!isTileWalkable(target.x, target.y)) return [];
        if(start.x === target.x && start.y === target.y) return [];
        
        let openSet = [start];
        let cameFrom = new Map();
        let gScore = new Map();
        let fScore = new Map();
        
        gScore.set(`${start.x},${start.y}`, 0);
        fScore.set(`${start.x},${start.y}`, Math.abs(start.x - target.x) + Math.abs(start.y - target.y));
        
        while(openSet.length > 0) {
            let current = openSet.reduce((a,b) => (fScore.get(`${a.x},${a.y}`) || Infinity) < (fScore.get(`${b.x},${b.y}`) || Infinity) ? a : b);
            
            if(current.x === target.x && current.y === target.y) {
                let path = [];
                let cur = current;
                while(cameFrom.has(`${cur.x},${cur.y}`)) {
                    path.unshift({ x: cur.x * TILE_SIZE + TILE_SIZE/2, y: cur.y * TILE_SIZE + TILE_SIZE/2 });
                    cur = cameFrom.get(`${cur.x},${cur.y}`);
                }
                path.push({ x: target.x * TILE_SIZE + TILE_SIZE/2, y: target.y * TILE_SIZE + TILE_SIZE/2 });
                return path;
            }
            
            openSet = openSet.filter(p => !(p.x === current.x && p.y === current.y));
            
            let neighbors = [
                { x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 },
                { x: current.x + 1, y: current.y + 1 }, { x: current.x - 1, y: current.y - 1 },
                { x: current.x + 1, y: current.y - 1 }, { x: current.x - 1, y: current.y + 1 }
            ];
            
            for(let neighbor of neighbors) {
                if(!isTileWalkable(neighbor.x, neighbor.y)) continue;
                
                let dist = (neighbor.x !== current.x && neighbor.y !== current.y) ? 1.4 : 1;
                let tentativeG = (gScore.get(`${current.x},${current.y}`) || 0) + dist;
                
                if(tentativeG < (gScore.get(`${neighbor.x},${neighbor.y}`) || Infinity)) {
                    cameFrom.set(`${neighbor.x},${neighbor.y}`, { x: current.x, y: current.y });
                    gScore.set(`${neighbor.x},${neighbor.y}`, tentativeG);
                    fScore.set(`${neighbor.x},${neighbor.y}`, tentativeG + Math.abs(neighbor.x - target.x) + Math.abs(neighbor.y - target.y));
                    if(!openSet.some(p => p.x === neighbor.x && p.y === neighbor.y)) {
                        openSet.push(neighbor);
                    }
                }
            }
        }
        return [];
    }
    
    // ========== СТАТИСТИКА ==========
    let stats = {
        mobsKilled: 0, totalGold: 0, totalDamage: 0, totalDamageTaken: 0,
        criticalHits: 0, dodges: 0, skillsUsed: 0, potionsUsed: 0,
        startTime: Date.now()
    };
    function getPlayTime() { let s = Math.floor((Date.now() - stats.startTime) / 1000); return { h: Math.floor(s/3600), m: Math.floor((s%3600)/60), s: s%60 }; }
    
    // ========== ИНВЕНТАРЬ ==========
    let inventory = {
        potionHp: 5, potionMp: 5, potionBigHp: 1, potionBigMp: 1,
        armorId: "cloth", weaponId: "dagger",
        armor: armors[0], weapon: weapons[0]
    };
    
    function getArmorById(id) { return armors.find(a => a.id === id); }
    function getWeaponById(id) { return weapons.find(w => w.id === id); }
    
    // ========== ИГРОК ==========
    let player = {
        x: 21 * TILE_SIZE, y: 17 * TILE_SIZE,
        targetX: null, targetY: null, path: [],
        hp: 450, maxHp: 450, mp: 100, maxMp: 100,
        level: 1, exp: 0, expToNext: 120,
        classType: "warrior",
        gold: 800, bankGold: 0,
        speed: 4.2,
        defense: 8,
        attackTimer: 0, superCooldown: 0,
        critChance: 12, dodgeChance: 6
    };
    
    function updateGear() {
        let armor = getArmorById(inventory.armorId);
        let weapon = getWeaponById(inventory.weaponId);
        inventory.armor = armor;
        inventory.weapon = weapon;
        player.defense = armor.def + Math.floor(player.level * 1.2);
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
    
    // ========== NPC ==========
    let safeZone = { x: 14 * TILE_SIZE, y: 12 * TILE_SIZE, width: 15 * TILE_SIZE, height: 11 * TILE_SIZE };
    let npcs = {
        shop: { x: 26 * TILE_SIZE, y: 21 * TILE_SIZE, radius: 28, name: "Торговец", icon: "🏪" },
        healer: { x: 16 * TILE_SIZE, y: 21 * TILE_SIZE, radius: 28, name: "Лекарь", icon: "💚" },
        banker: { x: 21 * TILE_SIZE, y: 13 * TILE_SIZE, radius: 28, name: "Банкир", icon: "🏦" },
        worldPortal: { x: 18 * TILE_SIZE, y: 13 * TILE_SIZE, radius: 28, name: "Портал миров", icon: "🌍" }
    };
    
    function isInSafeZone(x,y) { return x > safeZone.x && x < safeZone.x + safeZone.width && y > safeZone.y && y < safeZone.y + safeZone.height; }
    
    // ========== МОБЫ ==========
    let mobs = [], spawnTimer = 0, MAX_MOBS = 45;
    let currentWorldId = "forest";
    let currentWorld = worlds[currentWorldId];
    
    function createMob() {
        let avail = mobTypes.filter(m => player.level >= m.levelMin);
        if(avail.length === 0) avail = mobTypes;
        let t = avail[Math.floor(Math.random() * avail.length)];
        let lvl = Math.max(1, player.level + Math.floor(Math.random() * 6) - 3);
        let mult = currentWorld.mobMultiplier;
        let hpMult = 1 + (lvl-1) * 0.16;
        let dmgMult = 1 + (lvl-1) * 0.14;
        return {
            name: `${t.name} Lv.${lvl}`, level: lvl,
            hp: Math.floor(t.hp * hpMult * mult), maxHp: Math.floor(t.hp * hpMult * mult),
            dmg: Math.floor(t.dmg * dmgMult),
            exp: Math.floor(t.exp * (0.85 + lvl * 0.12) * mult),
            goldMin: Math.floor(t.goldMin * (0.8 + lvl * 0.05)), goldMax: Math.floor(t.goldMax * (0.9 + lvl * 0.07)),
            color: t.color, skin: t.skin, icon: t.icon, speed: t.speed, attackRange: t.range,
            x: 0, y: 0, attackTimer: 0
        };
    }
    
    function spawnMob() {
        if(mobs.length >= MAX_MOBS) return;
        for(let a = 0; a < 100; a++) {
            let tx = 5 + Math.floor(Math.random() * (MAP_WIDTH - 10));
            let ty = 5 + Math.floor(Math.random() * (MAP_HEIGHT - 10));
            if(isTileWalkable(tx, ty) && !isInSafeZone(tx * TILE_SIZE, ty * TILE_SIZE)) {
                let m = createMob();
                m.x = tx * TILE_SIZE + TILE_SIZE/2;
                m.y = ty * TILE_SIZE + TILE_SIZE/2;
                mobs.push(m);
                return;
            }
        }
    }
    
    // ========== ДВИЖЕНИЕ (A*) ==========
    function moveTo(x, y) {
        player.targetX = x;
        player.targetY = y;
        player.path = findPathAStar(player.x, player.y, x, y);
    }
    
    function updateMove() {
        if(!player.path || player.path.length === 0) return;
        let next = player.path[0];
        let dx = next.x - player.x;
        let dy = next.y - player.y;
        let dist = Math.hypot(dx, dy);
        if(dist < 8) {
            player.path.shift();
        } else {
            let step = Math.min(player.speed, dist);
            let ang = Math.atan2(dy, dx);
            let nx = player.x + Math.cos(ang) * step;
            let ny = player.y + Math.sin(ang) * step;
            let tileX = Math.floor(nx / TILE_SIZE);
            let tileY = Math.floor(ny / TILE_SIZE);
            if(isTileWalkable(tileX, tileY) && !isInSafeZone(nx, ny) === isInSafeZone(player.x, player.y) || 
               (isInSafeZone(nx, ny) && isAtGate(nx, ny)) || (!isInSafeZone(nx, ny) && isAtGate(player.x, player.y))) {
                player.x = nx;
                player.y = ny;
            } else {
                player.path = [];
                player.targetX = null;
            }
        }
    }
    
    function isAtGate(x, y) {
        let tx = Math.floor(x / TILE_SIZE);
        let ty = Math.floor(y / TILE_SIZE);
        return tileMap[ty] && tileMap[ty][tx] === TILE_GATE;
    }
    
    // ========== БОЙ ==========
    let selectedMob = null, messages = [], damageFloats = [], showStats = false, showInventory = false, shopOpen = false, bankOpen = false, explosionTarget = null, whirlwindActive = false, whirlwindTimer = 0;
    
    function addMsg(t, e = false) { messages.unshift({text: t, isErr: e, life: 220}); if(messages.length > 7) messages.pop(); }
    function showDamage(x, y, dmg, isPlayer = false, isCrit = false) { damageFloats.push({x, y, dmg, life: 26, isPlayer, isCrit}); }
    
    function calculateDamage() {
        let {min, max} = getDamageRange();
        let dmg = Math.floor(Math.random() * (max - min + 1) + min);
        let isCrit = Math.random() * 100 < player.critChance;
        if(isCrit) { dmg = Math.floor(dmg * 1.9); stats.criticalHits++; }
        return {dmg, isCrit};
    }
    
    function killMob(mob) {
        let expGain = mob.exp, goldGain = Math.floor(mob.goldMin + Math.random() * (mob.goldMax - mob.goldMin));
        player.exp += expGain; player.gold += goldGain;
        stats.mobsKilled++; stats.totalGold += goldGain;
        addMsg(`✨ +${expGain} опыта, +${goldGain}💰`);
        if(Math.random() < 0.45) { if(Math.random() < 0.6) inventory.potionHp++; else inventory.potionMp++; addMsg(`🧪 Выпало зелье!`); }
        if(Math.random() < 0.18) { if(Math.random() < 0.6) inventory.potionBigHp++; else inventory.potionBigMp++; addMsg(`✨ Выпало большое зелье!`); }
        let idx = mobs.indexOf(mob); if(idx !== -1) mobs.splice(idx, 1);
        if(selectedMob === mob) selectedMob = null;
        while(player.exp >= player.expToNext) {
            player.exp -= player.expToNext; player.level++;
            updateGear(); player.hp = player.maxHp; player.mp = player.maxMp;
            player.expToNext = 120 + player.level * 48;
            addMsg(`⭐⭐⭐⭐⭐ УРОВЕНЬ ${player.level}! ⭐⭐⭐⭐⭐`);
        }
    }
    
    function playerAttack() {
        if(!selectedMob || selectedMob.hp <= 0) { selectedMob = null; return false; }
        if(player.attackTimer > 0) return false;
        let dist = Math.hypot(player.x - selectedMob.x, player.y - selectedMob.y);
        let range = getAttackRange();
        if(dist > range) { addMsg(`🏃 Слишком далеко! (${Math.floor(dist)}/${range}px)`, true); return false; }
        let {dmg, isCrit} = calculateDamage();
        selectedMob.hp -= dmg; stats.totalDamage += dmg; player.attackTimer = 28;
        let cls = classes[player.classType];
        addMsg(`⚔️ ${cls.name} → ${dmg} урона${isCrit ? " (КРИТ!)" : ""} ${selectedMob.name}!`);
        showDamage(selectedMob.x, selectedMob.y, dmg, false, isCrit);
        if(selectedMob.hp <= 0) killMob(selectedMob);
        return true;
    }
    
    function useSuper() {
        if(player.superCooldown > 0) { addMsg(`🌟 Суперспособность: ${Math.ceil(player.superCooldown/10)} сек`, true); return; }
        let cls = classes[player.classType]; stats.skillsUsed++;
        if(cls.name === "Мечник") {
            whirlwindActive = true; whirlwindTimer = 30; player.superCooldown = 180;
            addMsg(`🌀 ВИХРЬ! Урон x2.2 по всем врагам!`);
            for(let mob of mobs) {
                if(Math.hypot(player.x - mob.x, player.y - mob.y) < 110 && mob.hp > 0) {
                    let {min, max} = getDamageRange(), avg = (min + max) / 2, dmg = Math.floor(avg * 2.2);
                    mob.hp -= dmg; stats.totalDamage += dmg; showDamage(mob.x, mob.y, dmg, false, true);
                    addMsg(`🌀 Вихрь → ${dmg} урона ${mob.name}!`);
                    if(mob.hp <= 0) killMob(mob);
                }
            }
        } else if(cls.name === "Лучник") {
            let targets = mobs.filter(m => m.hp > 0 && Math.hypot(player.x - m.x, player.y - m.y) < 220);
            targets.sort((a, b) => Math.hypot(player.x - a.x, player.y - a.y) - Math.hypot(player.x - b.x, player.y - b.y));
            let hit = 0;
            for(let mob of targets.slice(0, 3)) {
                let {min, max} = getDamageRange(), avg = (min + max) / 2, dmg = Math.floor(avg * 3.2);
                mob.hp -= dmg; stats.totalDamage += dmg; showDamage(mob.x, mob.y, dmg, false, true);
                addMsg(`🏹 Тройной выстрел → ${dmg} урона ${mob.name}!`);
                if(mob.hp <= 0) killMob(mob); hit++;
            }
            if(hit === 0) addMsg(`🏹 Нет врагов поблизости!`, true);
            else player.superCooldown = 180;
        } else if(cls.name === "Маг") { addMsg(`🔥 Нажмите на любое место для взрыва!`); explosionTarget = {active: true}; return; }
        if(explosionTarget?.active !== true) player.superCooldown = 180;
    }
    
    function castExplosion(wx, wy) {
        if(!explosionTarget?.active) return false;
        explosionTarget = null;
        let {min, max} = getDamageRange(), avg = (min + max) / 2, dmg = Math.floor(avg * 2.8), hit = false;
        for(let mob of mobs) {
            if(Math.hypot(wx - mob.x, wy - mob.y) < 100 && mob.hp > 0) {
                mob.hp -= dmg; stats.totalDamage += dmg; showDamage(mob.x, mob.y, dmg, false, true);
                addMsg(`🔥 Взрыв → ${dmg} урона ${mob.name}!`);
                if(mob.hp <= 0) killMob(mob); hit = true;
            }
        }
        damageFloats.push({x: wx, y: wy, dmg: "💥", life: 22, isExplosion: true});
        if(!hit) addMsg(`🔥 Взрыв не задел врагов!`, true);
        player.superCooldown = 180;
        return true;
    }
    
    // ========== МОБЫ АТАКУЮТ ==========
    function updateMobs() {
        for(let m of mobs) {
            if(m.hp <= 0) continue;
            let dx = player.x - m.x, dy = player.y - m.y, dist = Math.hypot(dx, dy);
            if(dist < 280 && !isInSafeZone(player.x, player.y)) {
                let ang = Math.atan2(dy, dx), step = Math.min(m.speed, dist - 55);
                if(step > 0) {
                    let nx = m.x + Math.cos(ang) * step, ny = m.y + Math.sin(ang) * step;
                    let tx = Math.floor(nx / TILE_SIZE), ty = Math.floor(ny / TILE_SIZE);
                    if(isTileWalkable(tx, ty) && !isInSafeZone(nx, ny)) { m.x = nx; m.y = ny; }
                }
                if(dist < m.attackRange + 20) {
                    if(m.attackTimer <= 0) {
                        let dodge = Math.random() * 100 < player.dodgeChance;
                        if(dodge) { stats.dodges++; addMsg(`✨ УВОРОТ! ${m.name} промахнулся!`, false); m.attackTimer = 30; continue; }
                        let dmg = Math.max(7, m.dmg - Math.floor(player.defense / 4.5));
                        player.hp -= dmg; stats.totalDamageTaken += dmg; m.attackTimer = 30;
                        addMsg(`💀 ${m.name} нанес ${dmg} урона!`, true);
                        showDamage(m.x, m.y, dmg, true);
                        if(player.hp <= 0) {
                            player.hp = player.maxHp; player.mp = player.maxMp;
                            player.x = 21 * TILE_SIZE; player.y = 17 * TILE_SIZE;
                            player.path = []; player.targetX = null;
                            addMsg(`💀 ВОСКРЕШЕНИЕ В БЕЗОПАСНОЙ ЗОНЕ 💀`, true);
                        }
                    } else m.attackTimer--;
                } else if(m.attackTimer > 0) m.attackTimer--;
            } else if(m.attackTimer > 0) m.attackTimer--;
        }
    }
    
    // ========== ЗЕЛЬЯ ==========
    function useHp() {
        if(!isInSafeZone(player.x, player.y)) { addMsg(`🏪 Зелья только в безопасной зоне!`, true); return; }
        if(inventory.potionHp <= 0 && inventory.potionBigHp <= 0) { addMsg(`❌ Нет зелий HP! Купите у торговца`, true); return; }
        stats.potionsUsed++;
        if(inventory.potionBigHp > 0 && player.hp < player.maxHp * 0.5) {
            let heal = Math.floor(player.maxHp * 0.95); player.hp = Math.min(player.maxHp, player.hp + heal); inventory.potionBigHp--;
            addMsg(`❤️❤️ БОЛЬШОЕ ЗЕЛЬЕ! +${heal} HP`);
        } else if(inventory.potionHp > 0) {
            let heal = Math.floor(player.maxHp * 0.72); player.hp = Math.min(player.maxHp, player.hp + heal); inventory.potionHp--;
            addMsg(`❤️ +${heal} HP`);
        } else addMsg(`❌ Нет малых зелий!`, true);
    }
    
    function useMp() {
        if(!isInSafeZone(player.x, player.y)) { addMsg(`🏪 Зелья только в безопасной зоне!`, true); return; }
        if(inventory.potionMp <= 0 && inventory.potionBigMp <= 0) { addMsg(`❌ Нет зелий MP! Купите у торговца`, true); return; }
        stats.potionsUsed++;
        if(inventory.potionBigMp > 0 && player.mp < player.maxMp * 0.5) {
            let mana = Math.floor(player.maxMp); player.mp = Math.min(player.maxMp, player.mp + mana); inventory.potionBigMp--;
            addMsg(`💙💙 БОЛЬШОЕ ЗЕЛЬЕ! +${mana} MP`);
        } else if(inventory.potionMp > 0) {
            let mana = Math.floor(player.maxMp * 0.78); player.mp = Math.min(player.maxMp, player.mp + mana); inventory.potionMp--;
            addMsg(`💙 +${mana} MP`);
        } else addMsg(`❌ Нет малых зелий!`, true);
    }
    
    // ========== NPC ФУНКЦИИ ==========
    const SHOP_POTIONS = [{name:"Зелье HP",type:"hp",price:55,icon:"❤️"},{name:"Зелье MP",type:"mp",price:50,icon:"💙"},{name:"Большое HP",type:"hp_big",price:160,icon:"❤️✨"},{name:"Большое MP",type:"mp_big",price:150,icon:"💙✨"}];
    
    function openShop() { if(isInSafeZone(player.x, player.y)) { shopOpen = !shopOpen; bankOpen = false; addMsg(shopOpen ? "🏪 Магазин открыт" : "🏪 Магазин закрыт"); } else addMsg(`🏪 Подойдите к торговцу!`, true); }
    function openBank() { if(isInSafeZone(player.x, player.y)) { bankOpen = !bankOpen; shopOpen = false; addMsg(bankOpen ? "🏦 Банк открыт" : "🏦 Банк закрыт"); } else addMsg(`🏦 Подойдите к банкиру!`, true); }
    function healFromNPC() { if(isInSafeZone(player.x, player.y)) { let cost = Math.floor(player.maxHp * 0.45); if(player.gold >= cost) { player.gold -= cost; player.hp = player.maxHp; player.mp = player.maxMp; addMsg(`💚 Полное восстановление! -${cost}💰`); } else addMsg(`💰 Не хватает золота! Нужно ${cost}`, true); } else addMsg(`💚 Подойдите к лекарю!`, true); }
    function changeWorld() { if(isInSafeZone(player.x, player.y)) { let worldIds = Object.keys(worlds); let idx = worldIds.indexOf(currentWorldId); currentWorldId = worldIds[(idx+1)%worldIds.length]; currentWorld = worlds[currentWorldId]; addMsg(`🌍 Переход в мир: ${currentWorld.name}`); for(let i=0;i<8;i++) spawnMob(); } else addMsg(`🌍 Подойдите к порталу!`, true); }
    function buyItem(item) { if(player.gold >= item.price) { player.gold -= item.price; if(item.type === "hp") inventory.potionHp++; else if(item.type === "mp") inventory.potionMp++; else if(item.type === "hp_big") inventory.potionBigHp++; else if(item.type === "mp_big") inventory.potionBigMp++; else if(item.type === "armor" && player.level >= item.level) { inventory.armorId = item.id; updateGear(); addMsg(`🛡️ Куплена ${item.name}!`); } else if(item.type === "weapon" && player.level >= item.level) { inventory.weaponId = item.id; updateGear(); addMsg(`⚔️ Куплено ${item.name}!`); } else if((item.type === "armor" || item.type === "weapon") && player.level < item.level) { addMsg(`❌ Требуется уровень ${item.level}!`, true); player.gold += item.price; return; } addMsg(`✅ Куплен ${item.name}!`); } else addMsg(`💰 Не хватает золота!`, true); }
    function depositGold() { let amount = Math.min(player.gold, 200); if(amount > 0) { player.gold -= amount; player.bankGold += amount; addMsg(`🏦 Внесено ${amount}💰. Баланс: ${player.bankGold}`); } else addMsg(`💰 Нет золота!`, true); }
    function withdrawGold() { let amount = Math.min(player.bankGold, 200); if(amount > 0) { player.bankGold -= amount; player.gold += amount; addMsg(`🏦 Снято ${amount}💰. Баланс: ${player.bankGold}`); } else addMsg(`🏦 Нет средств!`, true); }
    function switchClass(className) { if(player.classType === className) return; let hpPercent = player.hp / player.maxHp, mpPercent = player.mp / player.maxMp; player.classType = className; updateGear(); player.hp = Math.max(1, Math.min(player.maxHp, Math.floor(player.maxHp * hpPercent))); player.mp = Math.max(1, Math.min(player.maxMp, Math.floor(player.maxMp * mpPercent))); addMsg(`🔄 Класс: ${classes[className].name} ${classes[className].icon}`); }
    
    // ========== ВЗАИМОДЕЙСТВИЕ ==========
    function isClickOnNPC(wx, wy) { if(Math.hypot(wx - npcs.shop.x, wy - npcs.shop.y) < 38) { openShop(); return true; } if(Math.hypot(wx - npcs.healer.x, wy - npcs.healer.y) < 38) { healFromNPC(); return true; } if(Math.hypot(wx - npcs.banker.x, wy - npcs.banker.y) < 38) { openBank(); return true; } if(Math.hypot(wx - npcs.worldPortal.x, wy - npcs.worldPortal.y) < 38) { changeWorld(); return true; } return false; }
    function selectMobAt(wx, wy) { for(let m of mobs) if(Math.hypot(m.x - wx, m.y - wy) < 70 && m.hp > 0) { selectedMob = m; addMsg(`🎯 Цель: ${m.name} (${m.hp}/${m.maxHp} HP) Lv.${m.level}`); return true; } return false; }
    function handleClick(wx, wy) { if(showStats || showInventory) { showStats = false; showInventory = false; return; } if(shopOpen) { let cx = canvasWidth/2, cy = canvasHeight/2 - 80; for(let i=0;i<SHOP_POTIONS.length;i++) { let y = cy - 30 + i * 70; if(wy > cameraY + y - 25 && wy < cameraY + y + 50) { buyItem(SHOP_POTIONS[i]); return; } } for(let i=0;i<armors.length;i++) { let y = cy + 220 + i * 55; if(wy > cameraY + y - 25 && wy < cameraY + y + 45) { buyItem({...armors[i], type:"armor"}); return; } } for(let i=0;i<weapons.length;i++) { let y = cy + 220 + armors.length * 55 + i * 55; if(wy > cameraY + y - 25 && wy < cameraY + y + 45) { buyItem({...weapons[i], type:"weapon"}); return; } } shopOpen = false; return; } if(bankOpen) { let cx = canvasWidth/2, cy = canvasHeight/2 - 60; if(wy > cameraY + cy - 20 && wy < cameraY + cy + 60) { depositGold(); return; } if(wy > cameraY + cy + 80 && wy < cameraY + cy + 160) { withdrawGold(); return; } bankOpen = false; return; } if(explosionTarget?.active) { castExplosion(wx, wy); return; } if(isClickOnNPC(wx, wy)) return; if(selectMobAt(wx, wy)) return; moveTo(wx, wy); }
    
    // ========== КАМЕРА ==========
    function updateCamera() { let tx = player.x - canvasWidth/2, ty = player.y - canvasHeight/2; tx = Math.min(Math.max(tx, 0), WORLD_WIDTH - canvasWidth); ty = Math.min(Math.max(ty, 0), WORLD_HEIGHT - canvasHeight); cameraX += (tx - cameraX) * 0.12; cameraY += (ty - cameraY) * 0.12; }
    
    // ========== ОТРИСОВКА ==========
    function drawWorld() { let w = currentWorld; for(let y = 0; y < MAP_HEIGHT; y++) { for(let x = 0; x < MAP_WIDTH; x++) { let sx = x * TILE_SIZE - cameraX, sy = y * TILE_SIZE - cameraY; if(sx > -TILE_SIZE && sx < canvasWidth + TILE_SIZE && sy > -TILE_SIZE && sy < canvasHeight + TILE_SIZE) { let tile = tileMap[y][x]; if(tile === TILE_SAFE || tile === TILE_GATE) { ctx.fillStyle = "#88aa66"; ctx.fillRect(sx, sy, TILE_SIZE-1, TILE_SIZE-1); } else if(tile === TILE_TREE) { ctx.fillStyle = "#3c9e3c"; ctx.fillRect(sx+5, sy+10, 40, 40); ctx.fillStyle = "#8b5a2b"; ctx.fillRect(sx+20, sy+35, 10, 15); } else if(tile === TILE_MOUNTAIN) { ctx.fillStyle = "#6e6e7a"; ctx.beginPath(); ctx.moveTo(sx+25, sy+10); ctx.lineTo(sx+10, sy+45); ctx.lineTo(sx+40, sy+45); ctx.fill(); } else if(tile === TILE_WATER) { ctx.fillStyle = "#3a8cbb"; ctx.fillRect(sx, sy, TILE_SIZE-1, TILE_SIZE-1); ctx.fillStyle = "#5ac8ff"; for(let i=0;i<3;i++) ctx.fillRect(sx+10+i*15, sy+20, 8, 8); } else if(tile === TILE_ROCK) { ctx.fillStyle = "#7a6a5a"; ctx.beginPath(); ctx.ellipse(sx+25, sy+25, 15, 12, 0, 0, Math.PI*2); ctx.fill(); } else { let grad = ctx.createLinearGradient(sx, sy, sx+TILE_SIZE, sy+TILE_SIZE); grad.addColorStop(0, w.floor1); grad.addColorStop(1, w.floor2); ctx.fillStyle = grad; ctx.fillRect(sx, sy, TILE_SIZE-1, TILE_SIZE-1); } } } } for(let o of obstacles) { let x = o.x - cameraX, y = o.y - cameraY; if(x > -100 && x < canvasWidth+100 && y > -100 && y < canvasHeight+100) { if(o.type === 'tree') { ctx.fillStyle = "#3c9e3c"; ctx.fillRect(x-15, y-25, 30, 50); ctx.fillStyle = "#8b5a2b"; ctx.fillRect(x-8, y+5, 16, 25); } else if(o.type === 'mountain') { ctx.fillStyle = "#6e6e7a"; ctx.beginPath(); ctx.moveTo(x, y-35); ctx.lineTo(x-25, y+15); ctx.lineTo(x+25, y+15); ctx.fill(); } else if(o.type === 'rock') { ctx.fillStyle = "#7a6a5a"; ctx.beginPath(); ctx.ellipse(x, y, 14, 10, 0, 0, Math.PI*2); ctx.fill(); } else if(o.type === 'fence') { ctx.fillStyle = "#c99e6f"; ctx.fillRect(x-8, y-12, 16, 28); for(let i=0;i<3;i++) ctx.fillRect(x-4+i*4, y-18, 3, 12); } else if(o.type === 'river') { ctx.fillStyle = "#3a8cbb"; ctx.beginPath(); ctx.ellipse(x, y, 20, 15, 0, 0, Math.PI*2); ctx.fill(); } } } let szX = safeZone.x - cameraX, szY = safeZone.y - cameraY; ctx.fillStyle = "#88aa66aa"; ctx.fillRect(szX, szY, safeZone.width, safeZone.height); for(let n in npcs) { let npc = npcs[n]; let nx = npc.x - cameraX, ny = npc.y - cameraY; ctx.fillStyle = "#c99e6f"; ctx.fillRect(nx-20, ny-28, 40, 56); ctx.fillStyle = "#e8c28a"; ctx.fillRect(nx-14, ny-18, 28, 36); ctx.fillStyle = "#000"; ctx.fillRect(nx-9, ny-12, 6, 6); ctx.fillRect(nx+3, ny-12, 6, 6); ctx.font = "28px monospace"; ctx.fillStyle = "#ffdd99"; ctx.fillText(npc.icon, nx-14, ny+2); ctx.font = "9px monospace"; ctx.fillStyle = "#ffffaa"; ctx.fillText(npc.name, nx-22, ny-32); } }
    
    function drawPlayer() { let x = player.x - cameraX, y = player.y - cameraY; let cls = classes[player.classType]; ctx.fillStyle = "#e0c8a0"; ctx.fillRect(x-18, y-28, 36, 56); ctx.fillStyle = cls.color; ctx.fillRect(x-16, y-20, 32, 44); ctx.fillStyle = cls.armorColor; ctx.fillRect(x-14, y-12, 28, 32); ctx.fillStyle = "#fff"; ctx.fillRect(x-11, y-22, 7, 7); ctx.fillRect(x+4, y-22, 7, 7); ctx.fillStyle = "#000"; ctx.fillRect(x-10, y-21, 5, 5); ctx.fillRect(x+5, y-21, 5, 5); ctx.font = `${Math.min(28, canvasWidth/26)}px monospace`; ctx.fillStyle = "#ffffaa"; ctx.fillText(cls.icon, x-14, y+2); ctx.fillStyle = "#a33"; ctx.fillRect(x-28, y-44, 72, 10); ctx.fillStyle = "#4f6"; ctx.fillRect(x-28, y-44, 72 * (player.hp/player.maxHp), 10); ctx.fillStyle = "#58f"; ctx.fillRect(x-28, y-56, 72 * (player.mp/player.maxMp), 7); if(whirlwindActive) { ctx.fillStyle = "#ffaa44aa"; ctx.beginPath(); ctx.arc(x, y, 50, 0, Math.PI*2); ctx.fill(); whirlwindTimer--; if(whirlwindTimer <= 0) whirlwindActive = false; } }
    
    function drawMob(m) { let x = m.x - cameraX, y = m.y - cameraY; if(x < -100 || x > canvasWidth+100) return; ctx.fillStyle = m.skin; ctx.fillRect(x-18, y-28, 36, 56); ctx.fillStyle = m.color; ctx.fillRect(x-16, y-20, 32, 44); ctx.fillStyle = "#000"; ctx.fillRect(x-11, y-22, 6, 6); ctx.fillRect(x+5, y-22, 6, 6); ctx.font = `${Math.min(28, canvasWidth/26)}px monospace`; ctx.fillStyle = "#fff"; ctx.fillText(m.icon, x-12, y+2); let percent = m.hp / m.maxHp; ctx.fillStyle = "#a33"; ctx.fillRect(x-28, y-44, 72, 8); ctx.fillStyle = "#4f6"; ctx.fillRect(x-28, y-44, 72 * percent, 8); ctx.font = "10px monospace"; ctx.fillStyle = "#ffffaa"; ctx.fillText(`Lv.${m.level}`, x-18, y-52); }
    
    function drawUI() { let cls = classes[player.classType], fs = Math.max(14, Math.min(18, canvasWidth/48)); ctx.fillStyle = "#000000aa"; ctx.fillRect(12, 12, 300, 128); ctx.fillStyle = "#c55"; ctx.fillRect(18, 20, 280, 28); ctx.fillStyle = "#f75"; ctx.fillRect(18, 20, 280 * (player.hp/player.maxHp), 28); ctx.fillStyle = "#58f"; ctx.fillRect(18, 56, 280 * (player.mp/player.maxMp), 24); ctx.fillStyle = "#fff"; ctx.font = `bold ${fs}px monospace`; ctx.fillText(`❤️ ${Math.floor(player.hp)}/${player.maxHp}`, 22, 44); ctx.fillText(`💙 ${Math.floor(player.mp)}/${player.maxMp}`, 22, 78); ctx.fillStyle = "#fd9"; ctx.font = `bold ${fs+2}px monospace`; ctx.fillText(`${cls.name} ${cls.icon} Lv.${player.level}`, 22, 110); ctx.fillStyle = "#000000aa"; ctx.fillRect(12, 148, 300, 22); ctx.fillStyle = "#8af"; ctx.fillRect(12, 148, 300 * (player.exp/player.expToNext), 22); ctx.fillStyle = "#fff"; ctx.font = `${fs-2}px monospace`; ctx.fillText(`EXP: ${player.exp}/${player.expToNext}`, 18, 168); ctx.fillStyle = "#000000aa"; ctx.fillRect(canvasWidth-190, 12, 178, 88); ctx.fillStyle = "#fc8"; ctx.font = `bold ${fs}px monospace`; ctx.fillText(`💰 ${player.gold}`, canvasWidth-180, 38); ctx.fillText(`🏦 ${player.bankGold}`, canvasWidth-180, 68); ctx.fillText(`🌍 ${currentWorld.name}`, canvasWidth-180, 98); for(let i=0;i<Math.min(6,messages.length);i++) { let m = messages[i]; ctx.fillStyle = m.isErr ? "#f86c" : "#edbc"; ctx.font = `${fs-2}px monospace`; ctx.fillText(m.text.substring(0, 44), 15, canvasHeight-75-i*22); } if(selectedMob && selectedMob.hp > 0) { let x = selectedMob.x - cameraX, y = selectedMob.y - cameraY; ctx.strokeStyle = "#fa4"; ctx.lineWidth = 4; ctx.strokeRect(x-22, y-36, 68, 68); } if(player.targetX && player.path && player.path.length > 0) { let tx = player.targetX - cameraX, ty = player.targetY - cameraY; ctx.fillStyle = "#fc4a"; ctx.beginPath(); ctx.arc(tx, ty, 20, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = "#fa0"; ctx.beginPath(); ctx.arc(tx, ty, 12, 0, Math.PI*2); ctx.fill(); } for(let i=0;i<damageFloats.length;i++) { let d = damageFloats[i], x = d.x - cameraX, y = d.y - cameraY; if(d.isExplosion) { ctx.font = "bold 40px monospace"; ctx.fillStyle = "#ff8844"; ctx.fillText("💥", x-20, y-30); } else { ctx.font = `bold ${d.isPlayer ? 22 : 26}px monospace`; ctx.fillStyle = d.isCrit ? "#ffaa44" : (d.isPlayer ? "#fa6" : "#f84"); ctx.fillText(d.isCrit ? `⚡${d.dmg}⚡` : `-${d.dmg}`, x-14, y-34); } d.life--; if(d.life <= 0) damageFloats.splice(i,1), i--; } if(shopOpen && isInSafeZone(player.x, player.y)) { ctx.fillStyle = "#000000dd"; ctx.fillRect(canvasWidth/2-280, canvasHeight/2-240, 560, 480); ctx.fillStyle = "#fd9"; ctx.font = `bold ${Math.min(28,canvasWidth/24)}px monospace`; ctx.fillText("🏪 МАГАЗИН", canvasWidth/2-100, canvasHeight/2-190); ctx.font = "12px monospace"; ctx.fillStyle = "#cca"; ctx.fillText("ЗЕЛЬЯ", canvasWidth/2-260, canvasHeight/2-140); for(let i=0;i<SHOP_POTIONS.length;i++) { let it = SHOP_POTIONS[i], y = canvasHeight/2-120+i*65; ctx.fillStyle = "#a86"; ctx.fillRect(canvasWidth/2-260, y-10, 240, 48); ctx.fillStyle = "#fc8"; ctx.font = "14px monospace"; ctx.fillText(`${it.icon} ${it.name} - ${it.price}💰`, canvasWidth/2-240, y+12); } ctx.fillStyle = "#cca"; ctx.fillText("БРОНЯ", canvasWidth/2+40, canvasHeight/2-140); for(let i=0;i<armors.length;i++) { let it = armors[i], y = canvasHeight/2-120+i*55; ctx.fillStyle = "#a86"; ctx.fillRect(canvasWidth/2+20, y-10, 240, 44); ctx.fillStyle = "#fc8"; ctx.font = "12px monospace"; ctx.fillText(`${it.icon} ${it.name} (Ур.${it.level}) +${it.def} - ${it.price}💰`, canvasWidth/2+40, y+10); } ctx.fillStyle = "#cca"; ctx.fillText("ОРУЖИЕ", canvasWidth/2+40, canvasHeight/2+180); for(let i=0;i<weapons.length;i++) { let it = weapons[i], y = canvasHeight/2+200+i*55; ctx.fillStyle = "#a86"; ctx.fillRect(canvasWidth/2+20, y-10, 240, 44); ctx.fillStyle = "#fc8"; ctx.font = "12px monospace"; ctx.fillText(`${it.icon} ${it.name} (Ур.${it.level}) ${it.dmgMin}-${it.dmgMax} - ${it.price}💰`, canvasWidth/2+40, y+10); } } if(bankOpen && isInSafeZone(player.x, player.y)) { ctx.fillStyle = "#000000dd"; ctx.fillRect(canvasWidth/2-240, canvasHeight/2-170, 480, 340); ctx.fillStyle = "#fd9"; ctx.font = `bold ${Math.min(28,canvasWidth/24)}px monospace`; ctx.fillText("🏦 БАНК", canvasWidth/2-65, canvasHeight/2-100); ctx.fillStyle = "#a86"; ctx.fillRect(canvasWidth/2-180, canvasHeight/2-30, 360, 60); ctx.fillStyle = "#fc8"; ctx.font = "18px monospace"; ctx.fillText(`💰 Внести 200💰`, canvasWidth/2-130, canvasHeight/2+2); ctx.fillStyle = "#a86"; ctx.fillRect(canvasWidth/2-180, canvasHeight/2+55, 360, 60); ctx.fillStyle = "#fc8"; ctx.fillText(`🏦 Снять 200💰`, canvasWidth/2-130, canvasHeight/2+87); ctx.fillStyle = "#ffdd99"; ctx.font = "16px monospace"; ctx.fillText(`Ваш счет: ${player.bankGold}💰`, canvasWidth/2-85, canvasHeight/2+150); } if(showStats) { let t = getPlayTime(); ctx.fillStyle = "#000000dd"; ctx.fillRect(canvasWidth/2-280, canvasHeight/2-250, 560, 500); ctx.fillStyle = "#fd9"; ctx.font = `bold ${Math.min(30,canvasWidth/22)}px monospace`; ctx.fillText("📊 СТАТИСТИКА", canvasWidth/2-120, canvasHeight/2-180); ctx.font = `${Math.min(18,canvasWidth/34)}px monospace`; ctx.fillStyle = "#edb"; let y = canvasHeight/2-100; ctx.fillText(`👾 Убито мобов: ${stats.mobsKilled}`, canvasWidth/2-240, y); ctx.fillText(`💰 Всего золота: ${stats.totalGold}`, canvasWidth/2-240, y+38); ctx.fillText(`⚔️ Нанесено урона: ${stats.totalDamage}`, canvasWidth/2-240, y+76); ctx.fillText(`🛡️ Получено урона: ${stats.totalDamageTaken}`, canvasWidth/2-240, y+114); ctx.fillText(`⚡ Криты: ${stats.criticalHits}`, canvasWidth/2-240, y+152); ctx.fillText(`✨ Увороты: ${stats.dodges}`, canvasWidth/2-240, y+190); ctx.fillText(`🌟 Суперсилы: ${stats.skillsUsed}`, canvasWidth/2-240, y+228); ctx.fillText(`🧪 Зелий: ${stats.potionsUsed}`, canvasWidth/2-240, y+266); ctx.fillText(`⏱️ Время: ${t.h}ч ${t.m}м ${t.s}с`, canvasWidth/2-240, y+304); } if(showInventory) { ctx.fillStyle = "#000000dd"; ctx.fillRect(canvasWidth/2-260, canvasHeight/2-250, 520, 500); ctx.fillStyle = "#fd9"; ctx.font = `bold ${Math.min(30,canvasWidth/24)}px monospace`; ctx.fillText("🎒 ИНВЕНТАРЬ", canvasWidth/2-100, canvasHeight/2-180); ctx.font = `${Math.min(16,canvasWidth/36)}px monospace`; ctx.fillStyle = "#edb"; let y = canvasHeight/2-110; ctx.fillText(`🧪 Малые HP: ${inventory.potionHp}`, canvasWidth/2-220, y); ctx.fillText(`💙 Малые MP: ${inventory.potionMp}`, canvasWidth/2-220, y+32); ctx.fillText(`✨ Большие HP: ${inventory.potionBigHp}`, canvasWidth/2-220, y+64); ctx.fillText(`✨ Большие MP: ${inventory.potionBigMp}`, canvasWidth/2-220, y+96); ctx.fillText(`🛡️ ${inventory.armor.name} +${inventory.armor.def}`, canvasWidth/2-220, y+138); ctx.fillText(`⚔️ ${inventory.weapon.name} ${inventory.weapon.dmgMin}-${inventory.weapon.dmgMax}`, canvasWidth/2-220, y+170); ctx.fillStyle = "#fda"; ctx.fillText(`💰 Золото: ${player.gold}`, canvasWidth/2-220, y+212); ctx.fillStyle = "#8af"; ctx.fillText(`⭐ Уровень: ${player.level}`, canvasWidth/2-220, y+244); ctx.fillStyle = "#4f6"; ctx.fillText(`🛡️ Защита: ${Math.floor(player.defense)}`, canvasWidth/2-220, y+276); ctx.fillStyle = "#fa4"; ctx.fillText(`🎯 Крит: ${player.critChance}% | Уворот: ${player.dodgeChance}%`, canvasWidth/2-220, y+308); } if(player.superCooldown > 0) { let p = player.superCooldown / 180; ctx.fillStyle = "#000000aa"; ctx.fillRect(15, canvasHeight-85, 90, 16); ctx.fillStyle = "#ffaa44"; ctx.fillRect(15, canvasHeight-85, 90 * (1-p), 16); ctx.fillStyle = "#ffaa88"; ctx.font = "12px monospace"; ctx.fillText(`🌟 ${Math.ceil(player.superCooldown/10)}с`, 22, canvasHeight-66); } ctx.fillStyle = "#ffffffaa"; ctx.font = "11px monospace"; ctx.fillText(`⚔️ Урон: ${getDamageRange().min}-${getDamageRange().max}`, canvasWidth-170, canvasHeight-30); ctx.fillText(`🎯 Дальность: ${getAttackRange()}px`, canvasWidth-170, canvasHeight-15); }
    
    // ========== ОБНОВЛЕНИЕ ==========
    function update() { updateMove(); updateMobs(); updateCamera(); if(player.attackTimer > 0) player.attackTimer--; if(player.superCooldown > 0) player.superCooldown--; if(spawnTimer <= 0) { if(mobs.length < MAX_MOBS) for(let i=0;i<2;i++) spawnMob(); spawnTimer = 14; } else spawnTimer--; for(let i=0;i<messages.length;i++) if(messages[i].life) messages[i].life--; messages = messages.filter(m => !m.life || m.life > 0); }
    
    // ========== УПРАВЛЕНИЕ ==========
    function getWorldClick(cx, cy) { let rect = canvas.getBoundingClientRect(), sx = canvasWidth/rect.width, sy = canvasHeight/rect.height; return { x: (cx - rect.left) * sx + cameraX, y: (cy - rect.top) * sy + cameraY }; }
    canvas.addEventListener('click', (e) => { let w = getWorldClick(e.clientX, e.clientY); handleClick(w.x, w.y); });
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); let t = e.touches[0]; let w = getWorldClick(t.clientX, t.clientY); handleClick(w.x, w.y); });
    setInterval(() => { if(selectedMob && selectedMob.hp > 0 && Math.hypot(player.x - selectedMob.x, player.y - selectedMob.y) <= getAttackRange() + 22) playerAttack(); }, 2000);
    
    // Кнопки
    document.getElementById('superBtn').addEventListener('click', () => useSuper());
    document.getElementById('hpBtn').addEventListener('click', () => useHp());
    document.getElementById('mpBtn').addEventListener('click', () => useMp());
    document.getElementById('statsBtn').addEventListener('click', () => { showStats = !showStats; showInventory = false; });
    document.getElementById('inventoryBtn').addEventListener('click', () => { showInventory = !showInventory; showStats = false; });
    
    // Добавляем кнопки классов в HTML
    const rightButtons = document.createElement('div');
    rightButtons.className = 'right-buttons';
    rightButtons.innerHTML = `
        <button class="class-btn class-warrior" id="classWarriorBtn">⚔️</button>
        <button class="class-btn class-archer" id="classArcherBtn">🏹</button>
        <button class="class-btn class-mage" id="classMageBtn">🔮</button>
    `;
    document.body.appendChild(rightButtons);
    
    document.getElementById('classWarriorBtn').addEventListener('click', () => switchClass('warrior'));
    document.getElementById('classArcherBtn').addEventListener('click', () => switchClass('archer'));
    document.getElementById('classMageBtn').addEventListener('click', () => switchClass('mage'));
    
    // Управление с клавиатуры (1 - суперсила, 2 - зелье HP, 3 - зелье MP)
    window.addEventListener('keydown', (e) => {
        if(e.key === '1') useSuper();
        if(e.key === '2') useHp();
        if(e.key === '3') useMp();
        if(e.key === 'c') switchClass(player.classType === 'warrior' ? 'archer' : (player.classType === 'archer' ? 'mage' : 'warrior'));
    });
    
    // Подсказка для ПК
    const hint = document.createElement('div');
    hint.className = 'pc-hint';
    hint.innerHTML = '⌨️ 1 - СУПЕРСИЛА | 2 - ЗЕЛЬЕ HP | 3 - ЗЕЛЬЕ MP';
    document.body.appendChild(hint);
    
    // ========== СТАРТ ==========
    function init() { generateWorld(); player.x = 21 * TILE_SIZE; player.y = 17 * TILE_SIZE; updateGear(); player.hp = player.maxHp; player.mp = player.maxMp; for(let i=0;i<20;i++) spawnMob(); addMsg("✨ ДОБРО ПОЖАЛОВАТЬ! ✨"); addMsg("🗡️ Нажмите на моба → автоатака раз в 2 сек"); addMsg("🌟 1 - СУПЕРСИЛА | 2 - ЗЕЛЬЕ HP | 3 - ЗЕЛЬЕ MP"); addMsg("🏪 NPC: Торговец 🏪 | Лекарь 💚 | Банкир 🏦 | Портал миров 🌍"); }
    init();
    
    function render() { drawWorld(); for(let m of mobs) drawMob(m); drawPlayer(); drawUI(); }
    function loop() { update(); render(); requestAnimationFrame(loop); }
    loop();
})();
