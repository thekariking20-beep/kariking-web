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
      speed = (10 + Math.random() * 8) * powerMult;     
      this.friction = 0.91; 
      this.decay = Math.random() * 0.02 + 0.012; 
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
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ─── SINGLE ENTRY POINT: check localStorage, show overlay, start timeline ───
  useEffect(() => {
    if (localStorage.getItem('hasSeenWelcome') === 'true') return;

    // Show immediately — no delay to prevent white flash gap
    setShow(true);

    // Timeline steps
    const t1 = setTimeout(() => setStep(1), 500);
    const t2 = setTimeout(() => setStep(2), 2500);
    const t3 = setTimeout(() => setStep(3), 3500);
    const t4 = setTimeout(() => setStep(4), 4500);
    const t5 = setTimeout(() => setStep(5), 5500);

    // ─── FAILSAFE: auto-close after 12s if user never taps ───
    const failsafe = setTimeout(() => {
      localStorage.setItem('hasSeenWelcome', 'true');
      setShow(false);
    }, 12000);

    timersRef.current = [t1, t2, t3, t4, t5, failsafe];

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, []);

  const handleClose = () => {
    localStorage.setItem('hasSeenWelcome', 'true');
    timersRef.current.forEach(clearTimeout);
    setShow(false);
  };

  // ─── ROBUST CANVAS ENGINE LOOP ───
  useEffect(() => {
    if (!show || !canvasRef.current) return;

    let animationFrameId: number;
    let w = window.innerWidth;
    let h = window.innerHeight;
    
    const resizeInfo = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      if (canvasRef.current) {
        canvasRef.current.width = w;
        canvasRef.current.height = h;
      }
    };

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error("Could not acquire 2D context");

      resizeInfo();
      window.addEventListener('resize', resizeInfo);

      let flashAlpha = 0;
      let shakeIntensity = 0;
      
      const isMobile = w < 768;
      const PARTICLE_COUNT = isMobile ? 1200 : 3000;
      const ROCKET_COUNT = 30;
      
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
            shakeIntensity = 25; 
            for (let i = 0; i < 40; i++) getFreeParticle()?.init(x, y, '#FFFFFF', 'core', true);
            for (let i = 0; i < (isMobile ? 150 : 300); i++) getFreeParticle()?.init(x, y, '#F59E0B', 'main', true);
            for (let i = 0; i < (isMobile ? 100 : 180); i++) getFreeParticle()?.init(x, y, '#FDE68A', 'dust', true);
        } else {
            flashAlpha = 0.08; 
            shakeIntensity = 1.5; 
            for (let i = 0; i < 5; i++) getFreeParticle()?.init(x, y, '#FFF', 'core', false);
            for (let i = 0; i < (isMobile ? 30 : 60); i++) getFreeParticle()?.init(x, y, color, 'main', false);
            for (let i = 0; i < (isMobile ? 10 : 25); i++) getFreeParticle()?.init(x, y, '#FDE68A', 'dust', false);
        }
      };

      const startTimestamp = performance.now();
      let climaxFired = false;
      let nextRocketTime = startTimestamp + 500;

      const loop = (timestamp: number) => {
        try {
          const elapsed = timestamp - startTimestamp;
          
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(2, 0, 8, 0.4)'; 
          ctx.fillRect(0, 0, w, h);

          ctx.fillStyle = '#FFFFFF';
          stars.forEach(s => {
            const twinkle = 0.2 + (Math.sin((elapsed * 0.002) + s.alphaOffset) + 1) * 0.4;
            ctx.globalAlpha = twinkle;
            ctx.fillRect(s.x, s.y, s.size, s.size);
          });

          const isShaking = shakeIntensity > 0.5;
          if (isShaking) {
              ctx.save();
              ctx.translate((Math.random() - 0.5) * shakeIntensity, (Math.random() - 0.5) * shakeIntensity);
              shakeIntensity *= 0.85; 
          }

          ctx.globalCompositeOperation = 'lighter'; 

          rockets.forEach(r => {
            if (!r.active && r.trail.length === 0) return;
            r.update();
            r.draw(ctx);
            if (!r.active && r.trail.length > 0) {
              detonate(r.x, r.y, r.color, r.isClimax);
              r.trail = [];
            }
          });

          particles.forEach(p => {
            if (!p.active) return;
            p.update();
            p.draw(ctx);
          });

          if (flashAlpha > 0.05) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            ctx.fillRect(0, 0, w, h);
            flashAlpha -= 0.15; 
          }

          if (isShaking) {
              ctx.restore();
          }

          if (elapsed >= 500 && elapsed <= 2500) {
            if (timestamp > nextRocketTime) {
                const sx = Math.random() > 0.5 ? Math.random() * (w*0.3) : w - (Math.random() * (w*0.3));
                const tx = sx + (Math.random() * 300 - 150);
                const ty = h * (0.2 + Math.random() * 0.4);
                getFreeRocket()?.init(sx, h+50, tx, ty, FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)]);
                nextRocketTime = timestamp + 150 + Math.random() * 100;
            }
          }

          if (elapsed > 2500 && elapsed <= 3400) {
             if (timestamp > nextRocketTime) {
                const sx = Math.random() * w; 
                const tx = w * 0.5 + (Math.random() * 100 - 50); 
                const ty = h * 0.5; 
                getFreeRocket()?.init(sx, h+50, tx, ty, '#EF4444');
                nextRocketTime = timestamp + 300; 
             }
          }

          if (elapsed >= 3500 && !climaxFired) {
            climaxFired = true;
            getFreeRocket()?.init(w*0.5, h+50, w*0.5, h*0.5, '#FDE68A', true);
          }

          animationFrameId = requestAnimationFrame(loop);
        } catch (e) {
          console.error("Frame Crash:", e);
          cancelAnimationFrame(animationFrameId);
        }
      };

      animationFrameId = requestAnimationFrame(loop);
    } catch (bootstrapErr) {
      console.error("Canvas Engine Bootstrap Failed:", bootstrapErr);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeInfo);
    };
  }, [show]);

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
          <motion.canvas 
            ref={canvasRef} 
            animate={{ opacity: step >= 5 ? 0 : 1 }} 
            transition={{ duration: 4, ease: "easeOut" }} 
            className="absolute inset-0 pointer-events-none"
            style={{ filter: "drop-shadow(0 0 10px rgba(255,255,255,0.1))" }}
          />

          {step >= 3 && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.5, 1], opacity: [0, 1, 0.6] }}
              transition={{ duration: 1.5, ease: "backOut" }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200 blur-[80px] rounded-full pointer-events-none mix-blend-screen"
            />
          )}

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
                              className="w-64 md:w-80 h-auto drop-shadow-[0_0_50px_rgba(245,158,11,0.5)] rounded-full"
                          />
                      </motion.div>
                  </motion.div>
              )}

              {step >= 4 && (
                  <motion.div
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
                      className="mt-10 space-y-3 relative z-10" 
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
