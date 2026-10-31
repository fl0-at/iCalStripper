import { RRuleSet, rrulestr } from "rrule";
import { randomUUID } from "node:crypto";

export interface ICalProperty {
    key: string;
    value: string;
}

export interface ParsedICalDate {
    date: Date;
    allDay: boolean;
}

export function normalizeICalContent(content: string): string {
    return content
        .replace(/^\uFEFF/, "")
        .replace(/(?:\r\n|\n|\r)[ \t]/g, "");
}

export function parseICalPropertyLine(line: string): ICalProperty | undefined {
    let separator = -1;
    let insideQuotes = false;
    for (let index = 0; index < line.length; index += 1) {
        if (line[index] === '"' && line[index - 1] !== "\\") insideQuotes = !insideQuotes;
        else if (line[index] === ":" && !insideQuotes) {
            separator = index;
            break;
        }
    }
    if (separator <= 0) return undefined;
    return { key: line.slice(0, separator), value: line.slice(separator + 1) };
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

interface ICalEventBlock {
    lines: string[];
    properties: Array<{ lineIndex: number; property: ICalProperty }>;
}

const MAX_EXPANDED_OCCURRENCES = 10000;

export function stripICalendarEvents(content: string, rangeStart: Date, rangeEnd: Date): string {
    if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeStart > rangeEnd) {
        throw new Error("The selected iCalendar date range is invalid.");
    }

    const physicalLines = normalizeICalContent(content).split(/\r\n|\n|\r/);
    const logicalLines: Array<{ value: string; firstLine: number; lastLine: number }> = [];
    for (let index = 0; index < physicalLines.length; index += 1) {
        const line = physicalLines[index];
        if (/^[ \t]/.test(line) && logicalLines.length > 0) {
            const previous = logicalLines[logicalLines.length - 1];
            previous.value += line.slice(1);
            previous.lastLine = index;
        } else {
            logicalLines.push({ value: line, firstLine: index, lastLine: index });
        }
    }

    const componentStack: string[] = [];
    const outputNodes: Array<string | ICalEventBlock> = [];
    const calendarProperties = new Map<string, string>();
    let hasCalendar = false;
    let calendarClosed = false;
    let event: ICalEventBlock | undefined;

    for (const logicalLine of logicalLines) {
        const component = /^(BEGIN|END):([A-Z0-9-]+)$/i.exec(logicalLine.value);
        if (component) {
            const [, action, componentName] = component;
            const normalizedName = componentName.toUpperCase();

            if (action.toUpperCase() === "BEGIN") {
                if (normalizedName === "VCALENDAR") {
                    if (hasCalendar || componentStack.length !== 0) {
                        throw new Error("The iCalendar must contain exactly one top-level VCALENDAR.");
                    }
                    hasCalendar = true;
                }
                if (normalizedName === "VEVENT") {
                    if (event || componentStack[componentStack.length - 1] !== "VCALENDAR") {
                        throw new Error("An iCalendar event must be a direct child of VCALENDAR.");
                    }
                    event = { lines: [logicalLine.value], properties: [] };
                } else if (event) {
                    event.lines.push(logicalLine.value);
                } else {
                    outputNodes.push(logicalLine.value);
                }
                componentStack.push(normalizedName);
                continue;
            }

            if (event) event.lines.push(logicalLine.value);
            else outputNodes.push(logicalLine.value);

            const openComponent = componentStack.pop();
            if (openComponent !== normalizedName) {
                throw new Error(`The iCalendar component ${componentName} is not properly closed.`);
            }
            if (normalizedName === "VCALENDAR") calendarClosed = true;

            if (event && normalizedName === "VEVENT") {
                if (componentStack[componentStack.length - 1] !== "VCALENDAR") {
                    throw new Error("An iCalendar event must be a direct child of VCALENDAR.");
                }
                outputNodes.push(event);
                event = undefined;
            }
            continue;
        }

        if (event) {
            const property = componentStack[componentStack.length - 1] === "VEVENT"
                ? parseICalPropertyLine(logicalLine.value)
                : undefined;
            if (property) {
                event.properties.push({ lineIndex: event.lines.length, property });
            }
            event.lines.push(logicalLine.value);
        } else {
            if (componentStack[componentStack.length - 1] === "VCALENDAR") {
                const property = parseICalPropertyLine(logicalLine.value);
                if (property) calendarProperties.set(propertyName(property), property.value);
            }
            outputNodes.push(logicalLine.value);
        }
    }

    if (componentStack.length > 0 || event || !hasCalendar || !calendarClosed) {
        throw new Error("The selected file is not a complete iCalendar.");
    }
    if (!calendarProperties.has("VERSION") || !calendarProperties.has("PRODID")) {
        throw new Error("The iCalendar is missing the required VERSION or PRODID property.");
    }

    const events = outputNodes.filter((node): node is ICalEventBlock => typeof node !== "string");
    const overridesByUid = new Map<string, Set<string>>();
    for (const block of events) {
        const recurrenceId = findProperty(block, "RECURRENCE-ID");
        const uid = findProperty(block, "UID")?.property.value;
        if (recurrenceId && uid) {
            const overrideIds = overridesByUid.get(uid) ?? new Set<string>();
            overrideIds.add(recurrenceKey(recurrenceId.property));
            overridesByUid.set(uid, overrideIds);
        }
    }

    const outputLines: string[] = [];
    for (const node of outputNodes) {
        if (typeof node === "string") {
            outputLines.push(node);
            continue;
        }
        const block = node;
        const startEntry = findProperty(block, "DTSTART");
        if (!startEntry) throw new Error("An iCalendar event is missing DTSTART.");
        const start = parseICalDate(startEntry.property);
        const endEntry = findProperty(block, "DTEND");
        const recurrenceProperties = block.properties.filter(({ property }) =>
            ["RRULE", "RDATE", "EXRULE", "EXDATE"].includes(propertyName(property))
        );

        if (recurrenceProperties.length > 0) {
            const expanded = expandRecurringEvent(
                block,
                startEntry,
                endEntry,
                recurrenceProperties,
                rangeStart,
                rangeEnd,
                overridesByUid.get(findProperty(block, "UID")?.property.value ?? "")
            );
            outputLines.push(...expanded);
            continue;
        }

        const end = endEntry
            ? parseICalDate(endEntry.property)
            : start.allDay
                ? { ...start, date: new Date(start.date.getFullYear(), start.date.getMonth(), start.date.getDate() + 1) }
                : { ...start, date: new Date(start.date) };
        if (start.allDay !== end.allDay) {
            throw new Error("An iCalendar event must use matching date types for DTSTART and DTEND.");
        }
        if (end.date < start.date) {
            throw new Error("An iCalendar event ends before it starts.");
        }
        if (isICalEventWithinRange(start, end, rangeStart, rangeEnd)) {
            const recurrenceId = findProperty(block, "RECURRENCE-ID");
            if (!recurrenceId) {
                outputLines.push(...block.lines);
                continue;
            }

            const uid = findProperty(block, "UID");
            if (!uid) throw new Error("A detached recurrence instance is missing UID.");
            for (let index = 0; index < block.lines.length; index += 1) {
                if (index === recurrenceId.lineIndex) continue;
                outputLines.push(index === uid.lineIndex
                    ? `${uid.property.key}:${uid.property.value}-instance-${randomUUID()}`
                    : block.lines[index]);
            }
        }
    }

    return outputLines.map(foldICalLine).join("\r\n");
}

function findProperty(
    block: ICalEventBlock,
    name: string
): { lineIndex: number; property: ICalProperty } | undefined {
    const matches = block.properties.filter(({ property }) => propertyName(property) === name);
    if (matches.length > 1 && ["DTSTART", "DTEND", "DURATION", "UID"].includes(name)) {
        throw new Error(`An iCalendar event contains more than one ${name}.`);
    }
    return matches[0];
}

function propertyName(property: ICalProperty): string {
    return property.key.split(";", 1)[0].toUpperCase();
}

function expandRecurringEvent(
    block: ICalEventBlock,
    startEntry: { lineIndex: number; property: ICalProperty },
    endEntry: { lineIndex: number; property: ICalProperty } | undefined,
    recurrenceProperties: ICalEventBlock["properties"],
    rangeStart: Date,
    rangeEnd: Date,
    excludedRecurrenceIds?: Set<string>
): string[] {
    const start = parseICalDate(startEntry.property);
    const dateOnly = start.allDay;
    const end = endEntry ? parseICalDate(endEntry.property) : undefined;
    if (end && start.allDay !== end.allDay) {
        throw new Error("An iCalendar event must use matching date types for DTSTART and DTEND.");
    }
    if (end && end.date < start.date) {
        throw new Error("An iCalendar event ends before it starts.");
    }
    const timeZone = getTimeZone(startEntry.property);
    const floating = !dateOnly && !timeZone && !startEntry.property.value.endsWith("Z");
    const windowStart = timeZone
        ? timeZoneWallTime(rangeStart, timeZone)
        : floating || dateOnly
            ? localDateAsUtcWallTime(rangeStart)
            : rangeStart;
    const windowEnd = timeZone
        ? timeZoneWallTime(rangeEnd, timeZone)
        : floating || dateOnly
            ? localDateAsUtcWallTime(rangeEnd)
            : rangeEnd;
    const recurrenceLines = recurrenceProperties.map(({ property }) =>
        normalizeRecurrenceProperty(property, startEntry.property)
    );
    if (recurrenceLines.some(line => /(?:^|:)RDATE[^:\r\n]*VALUE=PERIOD/i.test(line) || /:\d{8}T\d{6}(?:Z)?\/\d{8}/i.test(line))) {
        throw new Error("Recurring events with RDATE PERIOD values are not supported.");
    }

    const ruleStart = `${dateOnly || timeZone
        ? "DTSTART"
        : startEntry.property.key}:${normalizeDateValue(startEntry.property.value, startEntry.property)}`;
    const recurrenceSet = rrulestr([ruleStart, ...recurrenceLines].join("\n"), { forceset: true }) as RRuleSet;
    recurrenceSet.rdate(new Date(getWallTime({
        key: "DTSTART",
        value: normalizeDateValue(startEntry.property.value, startEntry.property)
    })));
    const occurrences: Date[] = [];
    let exceededLimit = false;
    recurrenceSet.between(windowStart, windowEnd, true, (occurrence) => {
        if (occurrences.length >= MAX_EXPANDED_OCCURRENCES) {
            exceededLimit = true;
            return false;
        }
        occurrences.push(occurrence);
        return true;
    });
    if (exceededLimit) {
        throw new Error(`This recurrence produces more than ${MAX_EXPANDED_OCCURRENCES} occurrences in the selected range.`);
    }

    const durationMs = getEventDuration(block, startEntry.property, endEntry?.property);
    const durationWallMs = dateOnly || floating || timeZone
        ? endEntry
            ? getWallTime(endEntry.property) - getWallTime(startEntry.property)
            : durationMs
        : durationMs;
    const inclusiveEnd = timeZone
        ? timeZoneWallTime(new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() + 1), timeZone)
        : dateOnly || floating
            ? localDateAsUtcWallTime(new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() + 1))
            : rangeEnd;
    const selected = occurrences.filter(occurrence => {
        const occurrenceEnd = timeZone
            ? timeZoneWallTime(
                new Date(
                    dateInTimeZone(
                        occurrence.getUTCFullYear(),
                        occurrence.getUTCMonth() + 1,
                        occurrence.getUTCDate(),
                        occurrence.getUTCHours(),
                        occurrence.getUTCMinutes(),
                        occurrence.getUTCSeconds(),
                        timeZone
                    ).getTime() + durationMs
                ),
                timeZone
            )
            : new Date(occurrence.getTime() + durationWallMs);
        return occurrence >= windowStart && occurrenceEnd <= inclusiveEnd;
    });

    const uid = findProperty(block, "UID")?.property.value;
    const included = selected.filter(occurrence =>
        !uid || !excludedRecurrenceIds?.has(recurrenceKeyFromOccurrence(occurrence, startEntry.property))
    );
    if (included.length === 0) return [];

    const firstOccurrence = included[0];
    const newStart = `${startEntry.property.key}:${formatOccurrence(firstOccurrence, startEntry.property)}`;
    const rdateKey = `RDATE${startEntry.property.key.slice("DTSTART".length)}`;
    const rdates = included.slice(1).map(occurrence => formatOccurrence(occurrence, startEntry.property));
    const newEnd = endEntry
        ? `${endEntry.property.key}:${formatOccurrenceEnd(firstOccurrence, startEntry.property, endEntry.property, durationMs, durationWallMs)}`
        : undefined;
    const replacedLines: string[] = [];
    const recurrenceLineIndexes = new Set(recurrenceProperties.map(({ lineIndex }) => lineIndex));
    const durationEntry = findProperty(block, "DURATION");

    for (let index = 0; index < block.lines.length; index += 1) {
        if (recurrenceLineIndexes.has(index)) continue;
        if (durationEntry && index === durationEntry.lineIndex) continue;

        if (index === startEntry.lineIndex) {
            replacedLines.push(newStart);
            if (rdates.length > 0) replacedLines.push(`${rdateKey}:${rdates.join(",")}`);
        } else if (endEntry && index === endEntry.lineIndex) {
            replacedLines.push(newEnd!);
        } else {
            replacedLines.push(block.lines[index]);
        }
    }
    return replacedLines;
}

function normalizeRecurrenceProperty(property: ICalProperty, startProperty: ICalProperty): string {
    const name = propertyName(property);
    if (name === "RDATE" && /(?:^|;)VALUE=PERIOD(?:;|$)/i.test(property.key)) {
        return `${property.key}:${property.value}`;
    }

    let key = property.key;
    let value = property.value;
    const dateOnly = /^\d{8}$/.test(startProperty.value);
    const timeZone = getTimeZone(startProperty);
    if (name === "RDATE" || name === "EXDATE") {
        key = key.replace(/;TZID=(?:"[^"]+"|[^;]+)/i, "").replace(/;VALUE=DATE/i, "");
        value = value.split(",").map(date => {
            if (/^\d{8}$/.test(date)) return `${date}T000000Z`;
            if (timeZone) return date.replace(/Z$/i, "");
            return date;
        }).join(",");
    }
    if (name === "RRULE") {
        if (dateOnly) value = value.replace(/UNTIL=(\d{8})/i, "UNTIL=$1T235959Z");
        if (timeZone) {
            value = value.replace(/UNTIL=(\d{8}T\d{6})Z/i, (_match, utcValue: string) => {
                const utcDate = parseICalDate({ key: "UNTIL", value: `${utcValue}Z` }).date;
                const wallDate = timeZoneWallTime(utcDate, timeZone);
                return `UNTIL=${formatOccurrence(wallDate, { key: "DTSTART", value: utcValue })}`;
            });
        }
    }
    return `${key}:${value}`;
}

function normalizeDateValue(value: string, property: ICalProperty): string {
    if (/^\d{8}$/.test(value)) return `${value}T000000Z`;
    return getTimeZone(property) ? value.replace(/Z$/i, "") : value;
}

function getEventDuration(
    block: ICalEventBlock,
    startProperty: ICalProperty,
    endProperty?: ICalProperty
): number {
    if (endProperty) {
        return parseICalDate(endProperty).date.getTime() - parseICalDate(startProperty).date.getTime();
    }
    const durationEntry = findProperty(block, "DURATION");
    if (durationEntry) {
        const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(durationEntry.property.value);
        if (!match) throw new Error(`Unsupported event duration: ${durationEntry.property.value}`);
        return (
            (Number(match[1] ?? 0) * 7 * 86400 +
                Number(match[2] ?? 0) * 86400 +
                Number(match[3] ?? 0) * 3600 +
                Number(match[4] ?? 0) * 60 +
                Number(match[5] ?? 0)) * 1000
        );
    }
    return parseICalDate(startProperty).allDay ? 86400000 : 0;
}

function getWallTime(property: ICalProperty): number {
    const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/.exec(property.value);
    if (!match) throw new Error(`Invalid iCalendar date value for ${property.key}: ${property.value}`);
    return Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] ?? 0),
        Number(match[5] ?? 0),
        Number(match[6] ?? 0)
    );
}

function localDateAsUtcWallTime(date: Date): Date {
    return new Date(Date.UTC(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes(),
        date.getSeconds(),
        date.getMilliseconds()
    ));
}

function occurrenceWallTime(occurrence: Date, property: ICalProperty): Date {
    return new Date(Date.UTC(
        occurrence.getUTCFullYear(),
        occurrence.getUTCMonth(),
        occurrence.getUTCDate(),
        occurrence.getUTCHours(),
        occurrence.getUTCMinutes(),
        occurrence.getUTCSeconds(),
        occurrence.getUTCMilliseconds()
    ));
}

function formatOccurrence(occurrence: Date, property: ICalProperty): string {
    const wall = occurrenceWallTime(occurrence, property);
    const date = wall.toISOString().slice(0, 10).replace(/-/g, "");
    if (/^\d{8}$/.test(property.value)) return date;

    const time = `${pad(wall.getUTCHours())}${pad(wall.getUTCMinutes())}${pad(wall.getUTCSeconds())}`;
    return getTimeZone(property) || property.value.endsWith("Z")
        ? `${date}T${time}${property.value.endsWith("Z") ? "Z" : ""}`
        : `${date}T${time}`;
}

function formatOccurrenceEnd(
    occurrence: Date,
    startProperty: ICalProperty,
    endProperty: ICalProperty,
    durationMs: number,
    durationWallMs: number
): string {
    if (/^\d{8}$/.test(endProperty.value)) {
        const wallEnd = new Date(occurrenceWallTime(occurrence, startProperty).getTime() + durationWallMs);
        return wallEnd.toISOString().slice(0, 10).replace(/-/g, "");
    }

    const startTimeZone = getTimeZone(startProperty);
    if (!startTimeZone && !startProperty.value.endsWith("Z")) {
        const wallEnd = new Date(occurrenceWallTime(occurrence, startProperty).getTime() + durationWallMs);
        return formatOccurrence(wallEnd, endProperty);
    }

    const startInstant = startTimeZone
        ? dateInTimeZone(
            occurrence.getUTCFullYear(),
            occurrence.getUTCMonth() + 1,
            occurrence.getUTCDate(),
            occurrence.getUTCHours(),
            occurrence.getUTCMinutes(),
            occurrence.getUTCSeconds(),
            startTimeZone
        )
        : occurrence;
    return formatInstant(new Date(startInstant.getTime() + durationMs), endProperty);
}

function formatInstant(instant: Date, property: ICalProperty): string {
    const timeZone = getTimeZone(property);
    const fields = timeZone
        ? getTimeZoneFields(instant, timeZone)
        : {
            year: instant.getUTCFullYear(),
            month: instant.getUTCMonth() + 1,
            day: instant.getUTCDate(),
            hour: instant.getUTCHours(),
            minute: instant.getUTCMinutes(),
            second: instant.getUTCSeconds()
        };
    const date = `${fields.year}${pad(fields.month)}${pad(fields.day)}`;
    return /^\d{8}$/.test(property.value)
        ? date
        : `${date}T${pad(fields.hour)}${pad(fields.minute)}${pad(fields.second)}${property.value.endsWith("Z") ? "Z" : ""}`;
}

function getTimeZone(property: ICalProperty): string | undefined {
    const match = /(?:^|;)TZID=(?:"([^"]+)"|([^;]+))/i.exec(property.key);
    return match?.[1] || match?.[2];
}

function timeZoneWallTime(date: Date, timeZone: string): Date {
    const fields = getTimeZoneFields(date, timeZone);
    return new Date(Date.UTC(
        fields.year,
        fields.month - 1,
        fields.day,
        fields.hour,
        fields.minute,
        fields.second,
        date.getUTCMilliseconds()
    ));
}

function getTimeZoneFields(date: Date, timeZone: string): {
    year: number; month: number; day: number; hour: number; minute: number; second: number;
} {
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
    const values = formatter.formatToParts(date).reduce<Record<string, number>>((parts, part) => {
        if (part.type !== "literal") parts[part.type] = Number(part.value);
        return parts;
    }, {});
    return {
        year: values.year,
        month: values.month,
        day: values.day,
        hour: values.hour,
        minute: values.minute,
        second: values.second
    };
}

function recurrenceKey(property: ICalProperty): string {
    if (getTimeZone(property) || property.value.endsWith("Z")) {
        return parseICalDate(property).date.toISOString();
    }
    return new Date(getWallTime(property)).toISOString();
}

function recurrenceKeyFromOccurrence(occurrence: Date, property: ICalProperty): string {
    const timeZone = getTimeZone(property);
    if (timeZone) {
        return dateInTimeZone(
            occurrence.getUTCFullYear(),
            occurrence.getUTCMonth() + 1,
            occurrence.getUTCDate(),
            occurrence.getUTCHours(),
            occurrence.getUTCMinutes(),
            occurrence.getUTCSeconds(),
            timeZone
        ).toISOString();
    }
    if (property.value.endsWith("Z")) return occurrence.toISOString();
    return occurrenceWallTime(occurrence, property).toISOString();
}

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

function foldICalLine(line: string): string {
    const segments: string[] = [];
    let segment = "";
    let octets = 0;
    for (const character of line) {
        const characterLength = Buffer.byteLength(character, "utf8");
        if (octets + characterLength > 75) {
            segments.push(segment);
            segment = ` ${character}`;
            octets = 1 + characterLength;
        } else {
            segment += character;
            octets += characterLength;
        }
    }
    segments.push(segment);
    return segments.join("\r\n");
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
        return { date, allDay: dateOnly };
    }

    if (timeZone) {
        return { date: dateInTimeZone(year, month, day, hour, minute, second, timeZone), allDay: false };
    }

    if (
        date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day ||
        date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second
    ) {
        throw new Error(`Invalid iCalendar date value for ${property.key}: ${property.value}`);
    }
    return { date, allDay: false };
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
