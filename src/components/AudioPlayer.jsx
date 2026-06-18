import { useState, useRef, useEffect, useCallback } from 'react';

export default function AudioPlayer({ audioSrc, startTime = 0, endTime, autoPlay = true }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const audioRef = useRef(null);

  // Refs to avoid stale closures in event listeners
  const startRef = useRef(startTime);
  const endRef = useRef(endTime);
  const autoPlayRef = useRef(autoPlay);
  startRef.current = startTime;
  endRef.current = endTime;
  autoPlayRef.current = autoPlay;

  // Seek and play when segment changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    setError(null);
    setIsPlaying(false);
    setCurrentTime(startTime);
    setDuration(endTime ? endTime - startTime : 0);

    if (audio.readyState >= 1) {
      audio.currentTime = startTime;
      if (autoPlay) {
        audio.play().catch(() => {});
      }
    }
  }, [audioSrc, startTime, endTime, autoPlay]);

  // Bind event listeners once
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => {
      const st = startRef.current;
      const et = endRef.current;
      audio.currentTime = st;
      setDuration(et ? et - st : 0);
      if (autoPlayRef.current) {
        audio.play().catch(() => {});
      }
    };

    const onTimeUpdate = () => {
      const st = startRef.current;
      const et = endRef.current;
      const ct = audio.currentTime;
      setCurrentTime(ct);
      if (et && ct >= et) {
        audio.pause();
        audio.currentTime = st;
        setIsPlaying(false);
        setCurrentTime(st);
      }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      audio.currentTime = startRef.current;
      setCurrentTime(startRef.current);
    };
    const onErr = () => setError('音频加载失败，请确保已运行 extract-audio.sh');

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onErr);

    if (audio.readyState >= 1) onLoaded();

    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onErr);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const st = startRef.current;
    const et = endRef.current;

    if (isPlaying) {
      audio.pause();
    } else {
      if (et && audio.currentTime >= et) audio.currentTime = st;
      else if (audio.currentTime < st) audio.currentTime = st;
      audio.play().catch(() => {});
    }
  }, [isPlaying]);

  const replay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const st = startRef.current;
    audio.currentTime = st;
    setCurrentTime(st);
    audio.play().catch(() => {});
  }, []);

  const relativeTime = currentTime - startTime;
  const progress = duration > 0 ? (relativeTime / duration) * 100 : 0;

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-800">
        ⚠️ {error}
      </div>
    );
  }

  return (
    <div className="bg-gray-100 rounded-xl p-4">
      <audio ref={audioRef} src={audioSrc} preload="auto" />
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-12 h-12 rounded-full bg-primary-600 text-white flex items-center justify-center hover:bg-primary-700 transition-colors shrink-0"
        >
          {isPlaying ? (
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-6 h-6 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          onClick={replay}
          className="w-10 h-10 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:bg-gray-50 transition-colors shrink-0"
          title="重播"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <div className="h-2 bg-gray-300 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-100"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{formatTime(relativeTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
