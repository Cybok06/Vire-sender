import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { heroSlides } from './heroSlides';

interface HeroNavigationProps {
  activeIndex: number;
  onSelect: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  isPaused: boolean;
  onTogglePaused: () => void;
}

export default function HeroNavigation({ activeIndex, onSelect, onPrevious, onNext, isPaused, onTogglePaused }: HeroNavigationProps) {
  return (
    <div className="flex items-center justify-center lg:justify-start gap-3">
      <button
        type="button"
        onClick={onPrevious}
        aria-label="Previous hero slide"
        className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-all hover:scale-105"
        style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.14)' }}
      >
        <ChevronLeft size={18} />
      </button>

      <div className="flex items-center gap-2">
        {heroSlides.map((slide, index) => (
          <button
            key={slide.key}
            type="button"
            onClick={() => onSelect(index)}
            aria-label={`Show ${slide.eyebrow}`}
            className="h-2.5 rounded-full transition-all"
            style={{
              width: activeIndex === index ? 32 : 10,
              background: activeIndex === index ? slide.theme : 'rgba(255,255,255,0.28)',
            }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onTogglePaused}
        aria-label={isPaused ? 'Play hero slider' : 'Pause hero slider'}
        className="h-10 px-3 rounded-full flex items-center gap-1.5 text-white text-xs transition-all hover:scale-105"
        style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.14)', fontWeight: 700 }}
      >
        {isPaused ? <Play size={14} /> : <Pause size={14} />}
        <span className="hidden sm:inline">{isPaused ? 'Play' : 'Pause'}</span>
      </button>

      <button
        type="button"
        onClick={onNext}
        aria-label="Next hero slide"
        className="w-10 h-10 rounded-full flex items-center justify-center text-white transition-all hover:scale-105"
        style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.14)' }}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
