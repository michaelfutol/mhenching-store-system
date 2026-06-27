export interface AttendantSession {
  name: string;
  email: string;
  loginDate: string;
  loginAt: string;
}

export interface AttendantAccount {
  name: string;
  email: string;
  password: string;
}

const attendantSessionStorageKey = 'mhenching-attendant-session';

export const managerPin = process.env.NEXT_PUBLIC_MANAGER_PIN || '1234';

const defaultAttendantAccounts: AttendantAccount[] = [
  { name: 'Admin', email: 'admin', password: 'mhenchingadmin' },
  { name: 'Attendant 1', email: 'attendant1@mhenching.local', password: 'MHC-1-7429' },
  { name: 'Attendant 2', email: 'attendant2@mhenching.local', password: 'MHC-2-6184' },
];

const padDatePart = (value: number) => String(value).padStart(2, '0');

export const getLocalDateKey = (date = new Date()) => {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
};

export const normalizeAttendantName = (value: string) => value.trim().replace(/\s+/g, ' ');

export const normalizeAttendantEmail = (value: string) => value.trim().toLowerCase();

const parseAttendantAccounts = (value: string | undefined): AttendantAccount[] => {
  if (!value?.trim()) return defaultAttendantAccounts;

  const parsed = value
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [name, email, password] = entry.split('|').map((part) => part.trim());
      if (!name || !email || !password) return null;

      return {
        name: normalizeAttendantName(name),
        email: normalizeAttendantEmail(email),
        password,
      };
    })
    .filter((account): account is AttendantAccount => account !== null);

  return parsed.length > 0 ? parsed : defaultAttendantAccounts;
};

export const attendantAccounts = parseAttendantAccounts(process.env.NEXT_PUBLIC_ATTENDANT_ACCOUNTS);

export const validateAttendantLogin = (email: string, password: string): AttendantAccount | null => {
  const normalizedEmail = normalizeAttendantEmail(email);
  const rawPassword = password.trim();

  if (!normalizedEmail || !rawPassword) return null;

  return attendantAccounts.find((account) => (
    account.email === normalizedEmail && account.password === rawPassword
  )) || null;
};

export const getTodayAttendantSession = (): AttendantSession | null => {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(attendantSessionStorageKey);
    if (!stored) return null;

    const session = JSON.parse(stored) as Partial<AttendantSession>;
    if (!session.name || !session.email || session.loginDate !== getLocalDateKey()) {
      window.localStorage.removeItem(attendantSessionStorageKey);
      return null;
    }

    return {
      name: normalizeAttendantName(session.name),
      email: normalizeAttendantEmail(session.email),
      loginDate: session.loginDate,
      loginAt: session.loginAt || new Date().toISOString(),
    };
  } catch {
    window.localStorage.removeItem(attendantSessionStorageKey);
    return null;
  }
};

export const saveAttendantSession = (account: AttendantAccount): AttendantSession => {
  const session = {
    name: normalizeAttendantName(account.name),
    email: normalizeAttendantEmail(account.email),
    loginDate: getLocalDateKey(),
    loginAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(attendantSessionStorageKey, JSON.stringify(session));
  }

  return session;
};

export const clearAttendantSession = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(attendantSessionStorageKey);
  }
};
