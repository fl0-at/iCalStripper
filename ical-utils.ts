export interface ICalProperty {
    key: string;
    value: string;
}

export interface ParsedICalDate {
    date: Date;
    allDay: boolean;
    floating: boolean;
}

export function normalizeICalContent(content: string): string {
    return content
        .replace(/^\uFEFF/, "")
        .replace(/(?:\r\n|\n|\r)[ \t]/g, "");
}

export function getICalProperty(
    event: Record<string, unknown>,
    propertyName: string
): ICalProperty | undefined {
    const normalizedName = propertyName.toUpperCase();

    for (const [key, value] of Object.entries(event)) {
        if (
            (key.toUpperCase() === normalizedName || key.toUpperCase().startsWith(`${normalizedName};`)) &&
            typeof value === "string"
        ) {
            return { key, value };
        }
    }

    return undefined;
}

export function collectICalEvents(value: unknown): Record<string, unknown>[] {
    const events: Record<string, unknown>[] = [];
    const seen = new Set<object>();

    function collect(current: unknown): void {
        if (!current || typeof current !== "object") return;
        if (Array.isArray(current)) {
            for (const item of current) collect(item);
            return;
        }

        for (const [key, child] of Object.entries(current)) {
            if (key.toUpperCase() === "VEVENT" && Array.isArray(child)) {
                for (const event of child) {
                    if (event && typeof event === "object" && !seen.has(event)) {
                        seen.add(event);
                        events.push(event as Record<string, unknown>);
                    }
                }
            } else {
                collect(child);
            }
        }
    }

    collect(value);
    return events;
}

export function isICalEventWithinRange(
    start: ParsedICalDate,
    end: ParsedICalDate,
    rangeStart: Date,
    rangeEnd: Date
): boolean {
    const inclusiveEnd = start.allDay
        ? new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() + 1)
        : rangeEnd;
    return start.date >= rangeStart && end.date <= inclusiveEnd;
}

export function parseICalDate(property: ICalProperty): ParsedICalDate {
    const dateOnly = /^\d{8}$/.test(property.value) || /(?:^|;)VALUE=DATE(?:;|$)/i.test(property.key);
    const match = dateOnly
        ? /^(\d{4})(\d{2})(\d{2})$/.exec(property.value)
        : /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i.exec(property.value);

    if (!match) {
        throw new Error(`Invalid iCalendar date value for ${property.key}: ${property.value}`);
    }

    const [, yearText, monthText, dayText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = dateOnly ? 0 : Number(match[4]);
    const minute = dateOnly ? 0 : Number(match[5]);
    const second = dateOnly ? 0 : Number(match[6]);
    const isUtc = !dateOnly && Boolean(match[7]);
    const timeZoneMatch = dateOnly || isUtc
        ? undefined
        : /(?:^|;)TZID=(?:"([^"]+)"|([^;]+))/i.exec(property.key);
    const timeZone = timeZoneMatch?.[1] || timeZoneMatch?.[2];
    if (
        month < 1 || month > 12 || day < 1 || day > 31 ||
        hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59
    ) {
        throw new Error(`Invalid iCalendar date value for ${property.key}: ${property.value}`);
    }

    const calendarDate = createDate(year, month, day, 0, 0, 0, false);
    if (
        calendarDate.getUTCFullYear() !== year ||
        calendarDate.getUTCMonth() + 1 !== month ||
        calendarDate.getUTCDate() !== day
    ) {
        throw new Error(`Invalid iCalendar date value for ${property.key}: ${property.value}`);
    }

    const date = createDate(year, month, day, hour, minute, second, !timeZone && !isUtc);
    if (dateOnly || isUtc) {
        return { date, allDay: dateOnly, floating: false };
    }

    if (timeZone) {
        return { date: dateInTimeZone(year, month, day, hour, minute, second, timeZone), allDay: false, floating: false };
    }

    if (
        date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day ||
        date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second
    ) {
        throw new Error(`Invalid iCalendar date value for ${property.key}: ${property.value}`);
    }
    return { date, allDay: false, floating: true };
}

export function toICalBuilderDate(value: ParsedICalDate): Date {
    if (!value.allDay && !value.floating) {
        return value.date;
    }

    const date = new Date(0);
    date.setUTCFullYear(value.date.getFullYear(), value.date.getMonth(), value.date.getDate());
    date.setUTCHours(
        value.allDay ? 0 : value.date.getHours(),
        value.allDay ? 0 : value.date.getMinutes(),
        value.allDay ? 0 : value.date.getSeconds(),
        0
    );
    return date;
}

function createDate(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    local: boolean
): Date {
    const date = new Date(0);
    if (local) {
        date.setFullYear(year, month - 1, day);
        date.setHours(hour, minute, second, 0);
    } else {
        date.setUTCFullYear(year, month - 1, day);
        date.setUTCHours(hour, minute, second, 0);
    }
    return date;
}

function dateInTimeZone(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute: number,
    second: number,
    timeZone: string
): Date {
    const wallTime = createDate(year, month, day, hour, minute, second, false);
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    });
    let timestamp = wallTime.getTime();

    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = Object.fromEntries(
            formatter.formatToParts(new Date(timestamp))
                .filter(part => part.type !== "literal")
                .map(part => [part.type, Number(part.value)])
        );
        const representedTime = createDate(
            parts.year,
            parts.month,
            parts.day,
            parts.hour,
            parts.minute,
            parts.second,
            false
        ).getTime();
        const adjustedTimestamp = wallTime.getTime() - (representedTime - timestamp);
        if (adjustedTimestamp === timestamp) {
            break;
        }
        timestamp = adjustedTimestamp;
    }

    const resultParts = formatter.formatToParts(new Date(timestamp))
        .filter(part => part.type !== "literal")
        .reduce<Record<string, number>>((parts, part) => {
            parts[part.type] = Number(part.value);
            return parts;
        }, {});
    if (
        resultParts.year !== year || resultParts.month !== month || resultParts.day !== day ||
        resultParts.hour !== hour || resultParts.minute !== minute || resultParts.second !== second
    ) {
        throw new Error(`The local time in ${timeZone} does not exist: ${year}-${month}-${day} ${hour}:${minute}:${second}`);
    }

    return new Date(timestamp);
}
