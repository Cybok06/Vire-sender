import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import HeroNavigation from './HeroNavigation';
import HeroSlide from './HeroSlide';
import { heroSlides } from './heroSlides';

const CYAN = '#0EA5E9';
const PRIMARY = '#2563EB';
const ELEC_BLUE = '#1D4ED8';
const LIGHT_BG = '#F1F5F9';
const SLIDE_INTERVAL = 4000;

export default function HeroSlider() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const activeSlide = heroSlides[activeIndex];

  const nextIndex = useMemo(() => (activeIndex + 1) % heroSlides.length, [activeIndex]);

  const goTo = useCallback((index: number) => {
    setDirection(index >= activeIndex ? 1 : -1);
    setActiveIndex(index);
  }, [activeIndex]);

  const goNext = useCallback(() => {
    setDirection(1);
    setActiveIndex(current => (current + 1) % heroSlides.length);
  }, []);

  const goPrevious = useCallback(() => {
    setDirection(-1);
    setActiveIndex(current => (current - 1 + heroSlides.length) % heroSlides.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;

    const timer = window.setInterval(goNext, SLIDE_INTERVAL);
    return () => window.clearInterval(timer);
  }, [goNext, isPaused]);

  useEffect(() => {
    const image = new Image();
    image.src = heroSlides[nextIndex].backgroundImage;
  }, [nextIndex]);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    startX.current = event.clientX;
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (startX.current === null) return;
    const distance = event.clientX - startX.current;
    startX.current = null;
    if (Math.abs(distance) < 48) return;
    if (distance < 0) goNext();
    else goPrevious();
  };

  return (
    <section
      className="relative min-h-screen overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      style={{ background: 'linear-gradient(135deg, #06142B 0%, #0B1F3F 60%, #0d2563 100%)' }}
    >
      <link rel="preload" as="image" href={activeSlide.backgroundImage} />
      <link rel="preload" as="image" href={heroSlides[nextIndex].backgroundImage} />

      <div className="absolute inset-0 pointer-events-none overflow-hidden z-[1]">
        <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-20" style={{ background: CYAN, filter: 'blur(120px)' }} />
        <div className="absolute top-1/2 -left-40 w-96 h-96 rounded-full opacity-10" style={{ background: PRIMARY, filter: 'blur(100px)' }} />
        <div className="absolute bottom-0 right-1/3 w-80 h-80 rounded-full opacity-10" style={{ background: ELEC_BLUE, filter: 'blur(90px)' }} />
        <svg className="absolute inset-0 w-full h-full opacity-[0.055]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hero-vsgrid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.7" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-vsgrid)" />
        </svg>
        <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hero-vsdots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="white" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-vsdots)" />
        </svg>
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <HeroSlide key={activeSlide.key} slide={activeSlide} direction={direction} />
      </AnimatePresence>

      <div className="absolute z-20 left-0 right-0 bottom-16 md:bottom-20 pointer-events-none">
        <div className="max-w-6xl mx-auto px-5 pointer-events-auto">
          <HeroNavigation
            activeIndex={activeIndex}
            onSelect={goTo}
            onPrevious={goPrevious}
            onNext={goNext}
            isPaused={isPaused}
            onTogglePaused={() => setIsPaused(current => !current)}
          />
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20">
        <svg viewBox="0 0 1440 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
          <path d="M0 40C240 80 480 0 720 40C960 80 1200 0 1440 40V80H0V40Z" fill={LIGHT_BG} />
        </svg>
      </div>
    </section>
  );
}
