import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Drumstick } from 'lucide-react';
import logoImg from '../assets/kariking-logo.jpg';

// === HIGH PERFORMANCE VISUAL EFFECTS PHYSICS ENGINE ===

class Particle {
  active: boolean = false;
  x: number = 0; y: number = 0;
  vx: number = 0; vy: number = 0;
  size: number = 0; alpha: number = 0; decay: number = 0;
  color: string = '';
  gravity: number = 0; friction: number = 0;
  layer: 'core' | 'main' | 'dust' = 'main';

  init(x: number, y: number, color: string, layer: 'core' | 'main' | 'dust', isClimax: boolean) {
    this.active = true;
    this.x = x; this.y = y;
    this.color = color;
    this.layer = layer;
    
    const angle = Math.random() * Math.PI * 2;
    let speed = 0;
    const powerMult = isClimax ? 2.8 : 1.2; 

    if (layer === 'core') {
      speed = (Math.random() * 8 + 4) * powerMult;
      this.friction = 0.82; 
      this.decay = Math.random() * 0.15 + 0.1; 
      this.gravity = 0;
      this.size = Math.random() * (isClimax ? 15 : 6) + 4; 
    } else if (layer === 'main') {
      // Hollow ring expansion
      speed = (10 + Math.random() * 8) * powerMult; 
      this.friction = 0.91; 
      this.decay = Math.random() * 0.02 + 0.012; // Adjusted decay to linger nicely
      this.gravity = 0.02; 
      this.size = Math.random() * (isClimax ? 4.5 : 2) + 1.5;
    } else {
      speed = (Math.random() * 6 + 1) * powerMult;
      this.friction = 0.96;
      this.decay = Math.random() * 0.01 + 0.005; 
      this.gravity = 0.18; 
      this.size = Math.random() * 2.5 + 0.5;
    }

    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.alpha = 1;
  }

  update() {
    if (!this.active) return;
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.vy += this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.alpha -= this.decay;
    if (this.alpha <= 0) this.active = false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.active || this.alpha <= 0) return;
    
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.fillStyle = this.color;
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();

    if (this.layer !== 'dust' && this.size > 2) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }

    if (this.layer !== 'dust' && this.alpha > 0.3) {
      ctx.globalAlpha = Math.max(0, this.alpha * 0.3);
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
  }
}

class Rocket {
  active: boolean = false;
  x: number = 0; y: number = 0;
  targetX: number = 0; targetY: number = 0;
  vx: number = 0; vy: number = 0;
  color: string = '';
  trail: {x: number, y: number}[] = [];
  isClimax: boolean = false;

  init(sx: number, sy: number, tx: number, ty: number, color: string, isClimax: boolean = false) {
    this.active = true;
    this.isClimax = isClimax;
    this.x = sx; this.y = sy;
    this.targetX = tx; this.targetY = ty;
    this.color = color;
    this.trail = [];
    
    const dx = tx - sx;
    const dy = ty - sy;
    const angle = Math.atan2(dy, dx);
    // Rocket must travel fast enough to hit target
    const speed = isClimax ? (35 + Math.random() * 5) : (25 + Math.random() * 8); 
    
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed; 
  }

  update() {
    if (!this.active) return;
    
    this.vx *= 0.96;
    this.vy *= 0.96;
    
    this.x += this.vx;
    this.y += this.vy;
    
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > (this.isClimax ? 15 : 6)) this.trail.shift();

    // Critical detonate check
    if (Math.abs(this.vy) < 2 || this.y <= this.targetY) {
      this.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.active && this.trail.length === 0) return;
    
    ctx.beginPath();
    if (this.trail.length > 0) {
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      ctx.lineTo(this.x, this.y);
    }
    
    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.isClimax ? 8 : 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    if (this.isClimax) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
  }
}

export default function WelcomeAnimation() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
    if (!hasSeenWelcome) {
      const t = setTimeout(() => {
        setShow(true);
        startSequence();
      }, 100);
      return () => clearTimeout(t);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('hasSeenWelcome', 'true');
    setShow(false);
  };

  const startSequence = () => {
    setTimeout(() => setStep(1), 500);  
    setTimeout(() => setStep(2), 2500); 
    setTimeout(() => setStep(3), 3500); // Massive Climax Shot
    setTimeout(() => setStep(4), 4500); // Burn-in Logo Overly Reveal
    setTimeout(() => setStep(5), 5500); // CTA Button
  };

  // Canvas Engine Hook
  useEffect(() => {
    // CRITICAL FIX: Only depend on `show`. If `step` is here, it destroys the canvas rendering constantly!
    if (!show || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    const isMobile = w < 768;

    const resizeInfo = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    resizeInfo();
    window.addEventListener('resize', resizeInfo);

    let animationFrameId: number;
    let flashAlpha = 0;
    let shakeIntensity = 0;
    
    const PARTICLE_COUNT = isMobile ? 1500 : 4000;
    const ROCKET_COUNT = 40;
    
    const particles = Array.from({length: PARTICLE_COUNT}, () => new Particle());
    const rockets = Array.from({length: ROCKET_COUNT}, () => new Rocket());
    
    const stars = Array.from({length: 150}, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() < 0.1 ? 2 : 1, 
      alphaOffset: Math.random() * Math.PI * 2,
    }));

    const FIREWORK_COLORS = ['#FDE68A', '#F59E0B', '#EF4444', '#DC2626', '#FFB6C1'];

    let pIdx = 0;
    const getFreeParticle = () => {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        pIdx = (pIdx + 1) % PARTICLE_COUNT;
        if (!particles[pIdx].active) return particles[pIdx];
      }
      return null;
    };

    let rIdx = 0;
    const getFreeRocket = () => {
      for (let i = 0; i < ROCKET_COUNT; i++) {
        rIdx = (rIdx + 1) % ROCKET_COUNT;
        if (!rockets[rIdx].active) return rockets[rIdx];
      }
      return null;
    };

    const detonate = (x: number, y: number, color: string, isClimax: boolean) => {
      if (isClimax) {
          flashAlpha = 0.5; 
          shakeIntensity = 25; // Massive boom
          for (let i = 0; i < 40; i++) getFreeParticle()?.init(x, y, '#FFFFFF', 'core', true);
          for (let i = 0; i < (isMobile ? 200 : 400); i++) getFreeParticle()?.init(x, y, '#F59E0B', 'main', true);
          for (let i = 0; i < (isMobile ? 120 : 200); i++) getFreeParticle()?.init(x, y, '#FDE68A', 'dust', true);
      } else {
          flashAlpha = 0.08; 
          shakeIntensity = 1.5; 
          for (let i = 0; i < 5; i++) getFreeParticle()?.init(x, y, '#FFF', 'core', false);
          for (let i = 0; i < (isMobile ? 40 : 80); i++) getFreeParticle()?.init(x, y, color, 'main', false);
          for (let i = 0; i < (isMobile ? 15 : 30); i++) getFreeParticle()?.init(x, y, '#FDE68A', 'dust', false);
      }
    };

    // Strict Clock synchronization ensures canvas timeline identically matches React timeouts
    const startTimestamp = performance.now();
    let climaxFired = false;
    let nextRocketTime = startTimestamp + 500;

    const loop = (timestamp: number) => {
      const elapsed = timestamp - startTimestamp;
      
      // Native Canvas Motion Blur Trail Background
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(2, 0, 8, 0.4)'; 
      ctx.fillRect(0, 0, w, h);

      // Render Twinkling Stars
      ctx.fillStyle = '#FFFFFF';
      stars.forEach(s => {
        const twinkle = 0.2 + (Math.sin((elapsed * 0.002) + s.alphaOffset) + 1) * 0.4;
        ctx.globalAlpha = twinkle;
        ctx.fillRect(s.x, s.y, s.size, s.size);
      });

      // Camera Shake
      const isShaking = shakeIntensity > 0.5;
      if (isShaking) {
          ctx.save();
          ctx.translate((Math.random() - 0.5) * shakeIntensity, (Math.random() - 0.5) * shakeIntensity);
          shakeIntensity *= 0.85; 
      }

      ctx.globalCompositeOperation = 'lighter'; 

      // Render Rockets
      rockets.forEach(r => {
        if (!r.active && r.trail.length === 0) return;
        r.update();
        r.draw(ctx);
        if (!r.active && r.trail.length > 0) {
          detonate(r.x, r.y, r.color, r.isClimax);
          r.trail = [];
        }
      });

      // Render Particles
      particles.forEach(p => {
        if (!p.active) return;
        p.update();
        p.draw(ctx);
      });

      // Screen Flash Bloom
      if (flashAlpha > 0.05) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, w, h);
        flashAlpha -= 0.15; 
      }

      if (isShaking) {
          ctx.restore();
      }

      // SEQUENCE TIMELINE (Strict Milliseconds matching React step changes)
      
      // 1. Continuous early rockets (0.5s - 2.5s)
      if (elapsed >= 500 && elapsed <= 2500) {
        if (timestamp > nextRocketTime) {
            const sx = Math.random() > 0.5 ? Math.random() * (w*0.3) : w - (Math.random() * (w*0.3));
            const tx = sx + (Math.random() * 300 - 150);
            const ty = h * (0.2 + Math.random() * 0.4);
            getFreeRocket()?.init(sx, h+50, tx, ty, FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)]);
            nextRocketTime = timestamp + 150 + Math.random() * 100; // Randomize fire rate nicely
        }
      }

      // 2. Converge towards center (2.5s - 3.4s)
      if (elapsed > 2500 && elapsed <= 3400) {
         if (timestamp > nextRocketTime) {
            const sx = Math.random() * w; 
            const tx = w * 0.5 + (Math.random() * 100 - 50); 
            const ty = h * 0.5; // aim directly at the reveal zone
            getFreeRocket()?.init(sx, h+50, tx, ty, '#EF4444');
            nextRocketTime = timestamp + 300; // Slow down rate to build suspense
         }
      }

      // 3. FINAL MASSIVE CLIMAX BURN-IN ROCKET (3.5s exact)
      if (elapsed >= 3500 && !climaxFired) {
        climaxFired = true;
        // Super massive rocket to the exact absolute center
        getFreeRocket()?.init(w*0.5, h+50, w*0.5, h*0.5, '#FDE68A', true);
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeInfo);
    };
  }, [show]); // Removing 'step' prevents the canvas array destruction bug

  return (
    <AnimatePresence>
      {show && (
        <motion.div
           key="welcome-overlay"
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           exit={{ opacity: 0, transition: { duration: 1.2, ease: "easeInOut" } }}
           className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-black"
        >
          {/* THE CANVAS ENGINE */}
          <motion.canvas 
            ref={canvasRef} 
            animate={{ opacity: step >= 5 ? 0 : 1 }} // Keeps particles alive all the way till user explores
            transition={{ duration: 4, ease: "easeOut" }} 
            className="absolute inset-0 pointer-events-none"
            style={{ filter: "drop-shadow(0 0 10px rgba(255,255,255,0.1))" }}
          />

          {/* THE BURN-IN FIREBALL (Triggers instantly upon Climax Detonation logic at 3.5s) */}
          {step >= 3 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0.6] }}
              transition={{ duration: 1.5, ease: "backOut" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200 blur-[80px] rounded-full pointer-events-none mix-blend-screen"
            />
          )}

          {/* THE BRAND REVEAL */}
          <div className="z-10 flex flex-col items-center text-center px-6 relative w-full h-full justify-center">
            
            {step >= 4 && (
                <motion.div
                   initial={{ opacity: 0, scale: 0.8, filter: 'blur(20px)', y: 20 }}
                   animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 }}
                   transition={{ duration: 1.2, ease: "easeOut" }}
                   className="flex flex-col items-center relative z-20"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1.5, delay: 0.2, type: "spring", bounce: 0.4 }}
                        className="relative z-20"
                    >
                        <img 
                            src={logoImg}
                            alt="Kari King Logo"
                            className="w-64 md:w-80 h-auto drop-shadow-[0_0_50px_rgba(245,158,11,0.5)]"
                        />
                    </motion.div>
                </motion.div>
            )}

            {step >= 4 && (
                <motion.div
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                    className="mt-10 space-y-3 relative z-10" // Push text down a bit so the fireball breathes
                >
                    <h2 className="text-3xl font-black text-white tracking-wide drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
                        Welcome to Kari King <span className="inline-block animate-bounce ml-1 text-amber-300">👋</span>
                    </h2>
                    <p className="text-amber-200/90 font-bold uppercase tracking-widest text-sm mt-3 drop-shadow-[0_2px_5px_rgba(0,0,0,0.8)]">
                        Fresh. Organic. Trusted.
                    </p>
                </motion.div>
            )}

            {step >= 5 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="w-full mt-14 relative z-10"
                >
                    <button
                        onClick={handleClose}
                        className="group relative bg-gradient-to-r from-red-600 to-rose-700 text-white font-black text-xl px-10 py-5 rounded-full shadow-[0_0_50px_rgba(225,29,72,0.6)] flex items-center justify-center gap-3 w-full max-w-[320px] mx-auto overflow-hidden transition-transform active:scale-95 border border-red-400/30"
                    >
                        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                        <Drumstick className="w-6 h-6 text-amber-300 drop-shadow-[0_0_10px_#FCD34D]" />
                        <span className="tracking-wider drop-shadow-md">Start Exploring</span>
                    </button>
                </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
