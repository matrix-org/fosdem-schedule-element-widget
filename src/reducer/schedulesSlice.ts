import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import debounceAction from 'debounce-action';
import { AppThunk, RootState } from '../store';

export interface IScheduleEvent {
  id: string,
  start: string,
  end: string,
  slug: string,
  title: string,
  subtitle?: string,
  room?: string
}

type DateString = string;
type DateToEventMap = { [dateString: string]: IScheduleEvent[] };

interface ScheduleState {
  lists: DateToEventMap;
  start: string,
  end: string,
  isLoading: boolean;
  error: string | null;
  today: DateString | null;
}

const initialState: ScheduleState = {
  end: new Date().toISOString(),
  error: null,
  isLoading: true,
  lists: {},
  start: new Date().toISOString(),
  today: null
};

const getISODate = (date: Date = new Date()) => {
  const options = {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'Europe/Berlin',
    year: 'numeric'
  };
  const formatter = new Intl.DateTimeFormat(['sv'], options);
  return formatter.format(date);
};

const mapEvents = (elements: NodeListOf<Element>, currentDate: string) => {
  return Array.from(elements.values()).map((el) => {
    const startTime = el.querySelector('start')?.textContent;
    const duration = el.querySelector('duration')?.textContent || '';
    const durationMatch = /([\d]+):([\d]+)/.exec(duration);
    const durationHours = (durationMatch && durationMatch.length > 1 && Number.parseInt(durationMatch[1])) || 0;
    const durationMinutes = ((durationMatch && durationMatch.length > 2 && Number.parseInt(durationMatch[2])) || 0) + (durationHours * 60);
    const start = startTime ? new Date(`${currentDate}T${startTime}+01:00`) : new Date();
    const end = new Date(start);
    end.setMinutes(start.getMinutes() + durationMinutes);
    return (
      {
        end: end.toISOString(),
        id: el.id,
        room: el.querySelector('room')?.textContent,
        slug: el.querySelector('slug')?.textContent,
        start: start.toISOString(),
        subtitle: el.querySelector('subtitle')?.textContent,
        title: el.querySelector('title')?.textContent
      } as IScheduleEvent
    );
  });
};

const parseConferenceDates = (startDate?: string | null, endDate?: string | null): { start: Date, end: Date, current: Date } => {
  const currentDate = new Date();
  const start = startDate ? new Date(`${startDate}T00:00+01:00`) : new Date();
  const end = endDate ? new Date(`${endDate}T23:59:59+01:00`) : new Date();
  if (currentDate <= start) {
    return (
      {
        current: start,
        end,
        start
      }
    );
  }
  if (currentDate >= end) {
    return (
      {
        current: end,
        end,
        start
      }
    );
  };
  return (
    {
      current: new Date(),
      end,
      start
    }
  );
};

export const scheduleSlice = createSlice({
  initialState,
  name: 'schedule',
  reducers: {
    setError: (state, action: PayloadAction<string>) => {
      state.isLoading = false;
      state.error = action.payload;
    },
    setIsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setSchedule: (state, action: PayloadAction<{ events: DateToEventMap, start: string, end: string }>) => {
      state.lists = action.payload.events;
      state.start = action.payload.start;
      state.end = action.payload.end;
      state.error = null;
    },
    setToday: (state, action: PayloadAction<DateString>) => {
      state.today = action.payload;
    }
  }
});

export const getScheduleAsync = debounceAction((roomName: string): AppThunk => {
  return async (dispatch: any) => {
    dispatch(scheduleSlice.actions.setIsLoading(true));
    try {
      const response = await fetch((process.env.NODE_ENV === 'development') ? 'https://fosdem.org/2022/schedule/xml' : '/schedule');
      if (response.ok) {
        const xmlStr = await response.text();
        const parser = new DOMParser();
        const dom = parser.parseFromString(xmlStr, 'application/xml');
        const confStart = dom.querySelector('conference start')?.textContent;
        const confEnd = dom.querySelector('conference end')?.textContent;
        const { start, end } = parseConferenceDates(confStart, confEnd);

        const events: DateToEventMap = {};

        // Build up a map of events by day
        for (const dayElement of dom.querySelectorAll('day').values()) {
          const dateOfDay = dayElement.attributes.getNamedItem('date')?.nodeValue as string;
          const eventsOfDay = mapEvents(dayElement.querySelectorAll(`room${roomName ? `[name='${roomName}']` : ''} event`), dateOfDay);
          events[dateOfDay] = eventsOfDay;
        }

        dispatch(scheduleSlice.actions.setSchedule({
          end: end.toISOString(),
          events,
          start: start.toISOString()
        }));
      } else {
        console.warn('failed to fetch events from fosdem.org', response);
      }
    } catch (err) {
      dispatch(scheduleSlice.actions.setError(err.toString()));
    }
    dispatch(scheduleSlice.actions.setIsLoading(false));
  };
}, 400);


/**
 * Loop which updates today as the date changes.
 */
export async function updateTodayLoop(dispatch: any): Promise<void> {
  let lastToday: DateString | null = null;
  while (true) {
    const now = new Date();
    const newToday = getISODate(now);
    if (newToday !== lastToday) {
      dispatch(scheduleSlice.actions.setToday(newToday));
      lastToday = newToday;
    }

    const nextDay = new Date(`${newToday}T23:59:59+01:00`);

    // Clamp to at least 30 seconds to ensure that we don't have any hot loop if time doesn't progress as expected for some reason.
    const timeToWaitMilliseconds = Math.max(nextDay.getTime() - now.getTime(), 0) + 30_000;

    // Sleep.
    console.log('Waiting for new day in ', timeToWaitMilliseconds / 1000);
    await new Promise(resolve => {
      window.setTimeout(resolve, timeToWaitMilliseconds);
    });
    console.log('New day, refreshing');
  }
}


// Returns today's schedule, or if today isn't a conference day, clamps it to the nearest end of the schedule (start or end).
export const selectSchedule = (state: RootState): IScheduleEvent[] => {
  // If there are events today, that's easy.
  const today = state.schedule.today || '';
  const todaysSchedule = state.schedule.lists[today];
  if (todaysSchedule !== undefined) {
    return todaysSchedule;
  }

  // If no schedule for today, get nearest end of the conference

  const daysInSchedule = Object.keys(state.schedule.lists);
  daysInSchedule.sort();

  if (daysInSchedule.length <= 0) {
    // No schedule? Then no events for today.
    return [];
  }

  if (today < daysInSchedule[0]) {
    return state.schedule.lists[daysInSchedule[0]]!;
  }

  if (today > daysInSchedule[daysInSchedule.length - 1]) {
    return state.schedule.lists[daysInSchedule[daysInSchedule.length - 1]]!;
  }

  // Shouldn't happen in practice.
  console.warn('Today has no schedule, but not before start or after end! Showing no events');
  return [];
};
export const selectIsLoading = (state: RootState) => state.schedule.isLoading;
export const selectError = (state: RootState) => state.schedule.error;


export default scheduleSlice.reducer;
