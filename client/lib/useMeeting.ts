import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {api, ApiError} from './api';
import type {Meeting} from '../../shared/types';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'error';

const BACKUP_PREFIX = 'qwm.meeting.';
const SAVE_DEBOUNCE_MS = 900;

/** Keep a copy in the browser so a dropped connection mid-meeting loses nothing. */
function backup(meeting: Meeting): void {
  try {
    localStorage.setItem(BACKUP_PREFIX + meeting.id, JSON.stringify(meeting));
  } catch {
    /* storage full or blocked - the server copy is the real one */
  }
}

export function readBackup(id: string): Meeting | null {
  try {
    const raw = localStorage.getItem(BACKUP_PREFIX + id);
    return raw ? (JSON.parse(raw) as Meeting) : null;
  } catch {
    return null;
  }
}

function clearBackup(id: string): void {
  try {
    localStorage.removeItem(BACKUP_PREFIX + id);
  } catch {
    /* ignore */
  }
}

export interface MeetingStore {
  meeting: Meeting | null;
  setMeeting: (next: Meeting | null) => void;
  /** Apply a change locally and schedule an autosave. */
  update: (mutate: (current: Meeting) => Meeting) => void;
  /** Replace state from the server without triggering a save. */
  adopt: (next: Meeting) => void;
  saveState: SaveState;
  lastSavedAt: Date | null;
  saveNow: () => Promise<void>;
  error: string | null;
  dismissError: () => void;
}

export function useMeetingStore(onError?: (message: string) => void): MeetingStore {
  const [meeting, setMeetingState] = useState<Meeting | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = useRef<Meeting | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next || inFlight.current) return;

    inFlight.current = true;
    pending.current = null;
    setSaveState('saving');
    try {
      const saved = await api.saveMeeting(next);
      setLastSavedAt(new Date());
      setError(null);
      clearBackup(saved.id);
      // Adopt the server's updatedAt without clobbering edits made while saving.
      setMeetingState((current) =>
        current && current.id === saved.id ? {...current, updatedAt: saved.updatedAt} : current,
      );
      setSaveState(pending.current ? 'dirty' : 'saved');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not reach the server';
      const offline = !navigator.onLine || !(err instanceof ApiError);
      setSaveState(offline ? 'offline' : 'error');
      setError(message);
      if (!offline) errorRef.current?.(message);
      // Keep the change queued so the next attempt retries it.
      pending.current = pending.current ?? next;
    } finally {
      inFlight.current = false;
      if (pending.current) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
      }
    }
  }, []);

  const schedule = useCallback(
    (next: Meeting) => {
      pending.current = next;
      backup(next);
      setSaveState('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush],
  );

  const update = useCallback(
    (mutate: (current: Meeting) => Meeting) => {
      setMeetingState((current) => {
        if (!current) return current;
        const next = mutate(current);
        if (next === current) return current;
        schedule(next);
        return next;
      });
    },
    [schedule],
  );

  const adopt = useCallback((next: Meeting) => {
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    setMeetingState(next);
    setSaveState('idle');
  }, []);

  const setMeeting = useCallback((next: Meeting | null) => {
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    setMeetingState(next);
    setSaveState('idle');
  }, []);

  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    await flush();
  }, [flush]);

  // Retry as soon as the connection comes back.
  useEffect(() => {
    const retry = () => {
      if (pending.current) void flush();
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [flush]);

  // Warn before leaving with work that has not reached the server.
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (pending.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useMemo(
    () => ({
      meeting,
      setMeeting,
      update,
      adopt,
      saveState,
      lastSavedAt,
      saveNow,
      error,
      dismissError: () => setError(null),
    }),
    [meeting, setMeeting, update, adopt, saveState, lastSavedAt, saveNow, error],
  );
}

/** A ticking clock, updated once per second. */
export function useClock(enabled = true): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}
