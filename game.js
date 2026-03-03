// Game Configuration and State
const Config = {
    width: 1920, // Internal logical width
    height: 1080, // Internal logical height
    gravity: 0.2, // Simple integer/float gravity for our custom physics
    colors: ['#ff4757', '#1e90ff', '#2ed573', '#ffa502'],
    turnTime: 10
};

class Terrain {
    constructor(width, height) {
        this.width = width;
        this.height = height;

        // Creating an offscreen canvas for the terrain
        this.canvas = document.createElement('canvas');
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

        this.generate();
    }

    generate() {
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Base land
        this.ctx.fillStyle = '#8e44ad'; // Purple dirt (classic worms style)

        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height);

        let yBase = this.height * 0.6;
        for (let x = 0; x <= this.width; x += 10) {
            // Procedural hills
            let y = yBase + Math.sin(x * 0.005) * 150 + Math.sin(x * 0.02) * 50 + Math.cos(x * 0.05) * 20;
            this.ctx.lineTo(x, y);
        }

        this.ctx.lineTo(this.width, this.height);
        this.ctx.closePath();
        this.ctx.fill();

        // Grass layer on top
        this.ctx.globalCompositeOperation = 'source-atop';
        this.ctx.fillStyle = '#27ae60'; // Green grass
        this.ctx.fillRect(0, 0, this.width, yBase + 100);

        this.ctx.globalCompositeOperation = 'source-over';

        // Cache pixel data for instantaneous collision detection
        this.collisionData = this.ctx.getImageData(0, 0, this.width, this.height);
    }

    draw(ctx) {
        ctx.drawImage(this.canvas, 0, 0);
    }

    destroy(x, y, radius) {
        this.ctx.globalCompositeOperation = 'destination-out';
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalCompositeOperation = 'source-over';

        // Update cached pixel data after destruction
        // It's much faster to do this once per explosion than via isSolid on every frame.
        this.collisionData = this.ctx.getImageData(0, 0, this.width, this.height);
    }

    isSolid(x, y) {
        const px = Math.floor(x);
        const py = Math.floor(y);

        // Out of bounds horizontally is hard wall
        if (px < 0 || px >= this.width) return true;

        // Out of bounds vertically (above screen) is sky/empty
        if (py < 0) return false;

        // Out of bounds vertically (below screen) is hard floor
        if (py >= this.height) return true;

        const index = (py * this.width + px) * 4;
        return this.collisionData.data[index + 3] > 0;
    }
}

class Worm {
    constructor(id, x, y, color) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.radius = 12;
        this.color = color;
        this.hp = 100;
        this.vx = 0;
        this.vy = 0;
        this.isGrounded = false;
        this.facingRight = true;
    }

    update(deltaTime, terrain) {
        // Apply gravity
        this.vy += Config.gravity;

        // Terminal velocity
        if (this.vy > 10) this.vy = 10;

        // Tentative next position
        let nextX = this.x + this.vx;
        let nextY = this.y + this.vy;

        this.isGrounded = false;

        // Resolve collision by checking around the worm's center and bottom
        let maxClimb = 15;
        let wasSolid = false;

        // Empurrar para cima se estiver afundado
        while (terrain.isSolid(nextX, nextY + this.radius - 2) && maxClimb > 0) {
            nextY -= 1;
            maxClimb--;
            wasSolid = true;
        }

        // Se mesmo subindo o maximo continua preso (parede reta), desfaz o movimento X
        if (terrain.isSolid(nextX, nextY + this.radius - 2)) {
            nextX = this.x; // Block horizontal movement
            this.vx *= -0.3; // Small bounce

            // Re-apply vertical movement with blocked X
            nextY = this.y + this.vy;
            let fallClimb = 15;
            while (terrain.isSolid(nextX, nextY + this.radius - 2) && fallClimb > 0) {
                nextY -= 1;
                fallClimb--;
                wasSolid = true;
            }
        }

        if (wasSolid || terrain.isSolid(nextX, nextY + this.radius + 1)) {
            this.vy = 0;
            // Aumentar o atrito se encostou no chao
            this.vx *= 0.82;
            this.isGrounded = true;
        } else {
            // Atrito no ar para nao voar indefinidamente para o lado
            this.vx *= 0.98;
        }

        // Apply
        this.x = nextX;
        this.y = nextY;

        // Keep in bounds
        if (this.x < this.radius) { this.x = this.radius; this.vx *= -0.5; }
        if (this.x > Config.width - this.radius) { this.x = Config.width - this.radius; this.vx *= -0.5; }
        if (this.y > Config.height + 100) this.hp = 0; // Fell off screen
    }

    draw(ctx, isActive) {
        if (this.hp <= 0) return;

        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw eyes
        ctx.fillStyle = 'white';
        let eyeOffsetX = this.facingRight ? 4 : -4;
        ctx.beginPath();
        ctx.arc(this.x + eyeOffsetX, this.y - 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(this.x + eyeOffsetX + (this.facingRight ? 1 : -1), this.y - 4, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Indicator arrow if active
        if (isActive) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y - this.radius - 15);
            ctx.lineTo(this.x - 8, this.y - this.radius - 25);
            ctx.lineTo(this.x + 8, this.y - this.radius - 25);
            ctx.closePath();
            ctx.fill();
        }
    }
}

class Projectile {
    constructor(x, y, vx, vy, ownerId) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = 4;
        this.ownerId = ownerId;
        this.active = true;
    }

    update(deltaTime, terrain, game) {
        if (!this.active) return;

        this.vy += Config.gravity;

        // Sub-stepping for collision accuracy
        const steps = 3;
        const dx = this.vx / steps;
        const dy = this.vy / steps;

        for (let i = 0; i < steps; i++) {
            this.x += dx;
            this.y += dy;

            // Check collision
            if (terrain.isSolid(this.x, this.y)) {
                this.explode(game);
                return;
            }
            // Out of bounds
            if (this.x < 0 || this.x > Config.width || this.y > Config.height + 100) {
                this.active = false;
                game.nextTurn(); // Missed
                return;
            }
        }
    }

    explode(game) {
        this.active = false;
        const explosionRadius = 40;
        const damageRadius = 60;
        const maxDamage = 40;

        // Spawn particles
        for (let i = 0; i < 30; i++) {
            const colors = ['#f39c12', '#e74c3c', '#f1c40f', '#ffffff'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            game.particles.push(new Particle(this.x, this.y, color));
        }

        // Destroy terrain
        game.terrain.destroy(this.x, this.y, explosionRadius);

        // Apply damage & knockback
        for (let p of game.players) {
            if (p.hp <= 0) continue;

            const dist = Math.hypot(p.x - this.x, p.y - this.y);
            if (dist < damageRadius) {
                const dmg = Math.floor(maxDamage * (1 - dist / damageRadius));
                p.hp -= dmg;
                if (p.hp < 0) p.hp = 0;

                const angle = Math.atan2(p.y - this.y, p.x - this.x);
                const force = 10 * (1 - dist / damageRadius);
                p.vx += Math.cos(angle) * force;
                p.vy += Math.sin(angle) * force - 2;

                game.updateHealthBar(p.id, p.hp);
            }
        }

        game.nextTurn();
    }

    draw(ctx) {
        if (!this.active) return;
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 12;
        this.vy = (Math.random() - 0.5) * 12;
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.01;
        this.color = color;
        this.size = Math.random() * 4 + 2;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += Config.gravity * 0.5;
        this.life -= this.decay;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.canvas.width = Config.width;
        this.canvas.height = Config.height;
        this.ctx = this.canvas.getContext('2d');

        // Handle resizing
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // UI Elements
        this.mainMenu = document.getElementById('main-menu');
        this.hud = document.getElementById('hud');
        this.gameOverScreen = document.getElementById('game-over');
        this.healthContainer = document.getElementById('health-bars');
        this.turnIndicator = document.getElementById('turn-indicator');
        this.timerDisplay = document.getElementById('timer');
        this.winnerText = document.getElementById('winner-text');

        // Event Listeners for UI
        document.querySelectorAll('.player-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.startGame(parseInt(e.target.dataset.players)));
        });

        document.getElementById('restart-btn').addEventListener('click', () => {
            this.gameOverScreen.classList.remove('active');
            this.mainMenu.classList.add('active');
        });

        // Loop variables
        this.lastTime = 0;
        this.isRunning = false;

        // Game state variables
        this.players = [];
        this.currentPlayerIndex = 0;
        this.turnTimeLeft = Config.turnTime;
        this.timerInterval = null;
        this.projectiles = [];
        this.mousePos = null;
        this.particles = [];

        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false
        };

        // Generate background stars
        this.stars = [];
        for (let i = 0; i < 150; i++) {
            this.stars.push({
                x: Math.random() * Config.width,
                y: Math.random() * Config.height * 0.7,
                size: Math.random() * 2,
                alpha: Math.random()
            });
        }

        // Mouse bindings
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));

        // Keyboard bindings
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    getMousePos(evt) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY
        };
    }

    onMouseMove(e) {
        if (!this.isRunning || this.players.length === 0) return;
        this.mousePos = this.getMousePos(e);

        if (this.projectiles.length === 0) {
            const currentPlayer = this.players[this.currentPlayerIndex];
            if (currentPlayer) {
                currentPlayer.facingRight = this.mousePos.x > currentPlayer.x;
            }
        }
    }

    onKeyDown(e) {
        const key = e.key.toLowerCase();
        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = true;
        }

        if ((e.code === 'Space' || e.code === 'Enter') && this.isRunning && this.projectiles.length === 0 && this.mousePos) {
            const currentPlayer = this.players[this.currentPlayerIndex];

            const dx = this.mousePos.x - currentPlayer.x;
            const dy = this.mousePos.y - currentPlayer.y;

            const k = 0.05;
            let vx = dx * k;
            let vy = dy * k;

            const maxForce = 22;
            const forceMag = Math.hypot(vx, vy);
            if (forceMag > maxForce) {
                vx = (vx / forceMag) * maxForce;
                vy = (vy / forceMag) * maxForce;
            }

            if (forceMag > 2) {
                this.fireProjectile(currentPlayer.x, currentPlayer.y, vx, vy);
            }
        }
    }

    onKeyUp(e) {
        const key = e.key.toLowerCase();
        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = false;
        }
    }

    fireProjectile(x, y, vx, vy) {
        this.projectiles.push(new Projectile(x, y, vx, vy, this.currentPlayerIndex));
        // Pause timer while projectile flies
        clearInterval(this.timerInterval);
    }

    resize() {
        // We use CSS to scale the visual canvas element, keeping the internal logic coordinate system fixed.
        // The canvas already has width:100% and height:100% in CSS, 
        // we just need to ensure aspect ratio is maintained or just let it stretch natively.
        // Actually, CSS object-fit: contain would be best. Let's not redefine logic width.
    }

    startGame(numPlayers) {
        console.log(`Starting game with ${numPlayers} players`);
        this.mainMenu.classList.remove('active');
        this.hud.classList.add('active');

        // Initialize Game State
        this.terrain = new Terrain(Config.width, Config.height);
        this.players = [];

        // Spawn worms (evenly spaced)
        const spacing = Config.width / (numPlayers + 1);
        for (let i = 0; i < numPlayers; i++) {
            const spawnX = spacing * (i + 1);
            let spawnY = 0; // Começa a verificar do topo da tela

            // Vai descendo até encostar no chão do terreno
            while (!this.terrain.isSolid(spawnX, spawnY + 12) && spawnY < Config.height) {
                spawnY += 1;
            }

            this.players.push(new Worm(i, spawnX, spawnY, Config.colors[i]));
        }

        this.currentPlayerIndex = 0;
        this.turnTimeLeft = Config.turnTime;

        // Setup HUD
        this.setupHUD(numPlayers);

        // Start loop
        this.isRunning = true;
        this.lastTime = performance.now();
        requestAnimationFrame((time) => this.gameLoop(time));

        // Start timer
        this.startTurnTimer();
    }

    setupHUD(numPlayers) {
        this.healthContainer.innerHTML = '';
        for (let i = 0; i < numPlayers; i++) {
            const playerDiv = document.createElement('div');
            playerDiv.className = `player-health hp-p${i + 1}`;
            playerDiv.innerHTML = `
                <div class="player-name">P${i + 1}</div>
                <div class="health-bar-bg">
                    <div class="health-bar-fill" id="hp-fill-p${i}" style="width: 100%"></div>
                </div>
            `;
            this.healthContainer.appendChild(playerDiv);
        }
        this.updateTurnIndicator();
    }

    updateTurnIndicator() {
        this.turnIndicator.innerText = `Turno: Jogador ${this.currentPlayerIndex + 1}`;
        this.turnIndicator.style.color = Config.colors[this.currentPlayerIndex];
    }

    startTurnTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.turnTimeLeft = Config.turnTime;
        this.timerDisplay.innerText = this.turnTimeLeft;

        this.timerInterval = setInterval(() => {
            if (!this.isRunning) return;

            this.turnTimeLeft--;
            this.timerDisplay.innerText = this.turnTimeLeft;

            if (this.turnTimeLeft <= 0) {
                this.nextTurn();
            }
        }, 1000);
    }

    nextTurn() {
        // Logic to move to next alive player
        console.log('Next turn!');
        let tries = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            tries++;
        } while (this.players[this.currentPlayerIndex].hp <= 0 && tries <= this.players.length);

        this.updateTurnIndicator();
        this.startTurnTimer();
    }

    updateHealthBar(id, hp) {
        const bar = document.getElementById(`hp-fill-p${id}`);
        if (bar) {
            const h = Math.max(0, Math.min(100, hp));
            bar.style.width = `${h}%`;
        }
    }

    endGame(winnerIndex) {
        this.isRunning = false;
        clearInterval(this.timerInterval);
        this.hud.classList.remove('active');
        this.gameOverScreen.classList.add('active');
        this.winnerText.innerText = `Jogador ${winnerIndex + 1} Venceu!`;
        this.winnerText.style.color = Config.colors[winnerIndex];
    }

    gameLoop(timestamp) {
        if (!this.isRunning) return;

        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update(deltaTime);
        this.draw();

        requestAnimationFrame((time) => this.gameLoop(time));
    }

    update(deltaTime) {
        // Player input for movement
        if (this.isRunning && this.projectiles.length === 0) {
            const currentPlayer = this.players[this.currentPlayerIndex];
            if (currentPlayer && currentPlayer.hp > 0) {
                const moveSpeed = 2;
                const jumpForce = -7;

                if (this.keys.a) {
                    currentPlayer.vx -= moveSpeed * 0.2;
                }
                if (this.keys.d) {
                    currentPlayer.vx += moveSpeed * 0.2;
                }
                if (this.keys.w && currentPlayer.isGrounded) {
                    currentPlayer.vy = jumpForce;
                    currentPlayer.isGrounded = false;
                }
            }
        }

        // Physics and logic update
        for (let player of this.players) {
            if (player.hp > 0) {
                player.update(deltaTime, this.terrain);
            }
        }

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(deltaTime, this.terrain, this);
            if (!p.active) {
                this.projectiles.splice(i, 1);
            }
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update();
            if (this.particles[i].life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Check game over
        const alivePlayers = this.players.filter(p => p.hp > 0);
        if (alivePlayers.length <= 1 && this.isRunning) {
            const winner = alivePlayers.length === 1 ? alivePlayers[0].id : -1;
            this.endGame(winner);
        }
    }

    draw() {
        // Draw background with gradient
        const grad = this.ctx.createLinearGradient(0, 0, 0, Config.height);
        grad.addColorStop(0, '#0a0a2a');
        grad.addColorStop(1, '#2c3e50');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, Config.width, Config.height);

        // Draw stars
        this.ctx.fillStyle = 'white';
        for (let s of this.stars) {
            this.ctx.globalAlpha = s.alpha;
            this.ctx.beginPath();
            this.ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1.0;

        // Draw terrain
        if (this.terrain) {
            this.terrain.draw(this.ctx);
        }

        // Draw worms
        for (let i = 0; i < this.players.length; i++) {
            this.players[i].draw(this.ctx, i === this.currentPlayerIndex);
        }

        // Draw projectiles
        for (let p of this.projectiles) {
            p.draw(this.ctx);
        }

        // Draw particles
        for (let p of this.particles) {
            p.draw(this.ctx);
        }

        // Draw aiming trajectory
        if (this.isRunning && this.projectiles.length === 0 && this.mousePos) {
            const currentPlayer = this.players[this.currentPlayerIndex];
            const dx = this.mousePos.x - currentPlayer.x;
            const dy = this.mousePos.y - currentPlayer.y;

            const k = 0.05;
            let vx = dx * k;
            let vy = dy * k;

            const maxForce = 22;
            const forceMag = Math.hypot(vx, vy);
            if (forceMag > maxForce) {
                vx = (vx / forceMag) * maxForce;
                vy = (vy / forceMag) * maxForce;
            }

            // Draw Trajectory dots
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            let simX = currentPlayer.x;
            let simY = currentPlayer.y;
            let simVx = vx;
            let simVy = vy;

            for (let i = 0; i < 70; i++) {
                simVy += Config.gravity;
                simX += simVx;
                simY += simVy;

                if (i % 4 === 0) {
                    this.ctx.beginPath();
                    this.ctx.arc(simX, simY, 2.5, 0, Math.PI * 2);
                    this.ctx.fill();
                }

                if (this.terrain && this.terrain.isSolid(simX, simY)) break;
            }

            // Draw aiming line to show direction and power
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(currentPlayer.x, currentPlayer.y);
            this.ctx.lineTo(currentPlayer.x + dx, currentPlayer.y + dy);
            this.ctx.stroke();
        }
    }
}

// Start app
window.onload = () => {
    new Game();
};
