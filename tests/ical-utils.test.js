const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
    normalizeICalContent,
    parseICalDate,
    parseICalPropertyLine,
    stripICalendarEvents
} = require("../build/ical-utils.js");

test("normalizes BOM and unfolds continuation lines", () => {
    assert.equal(
        normalizeICalContent("\uFEFFBEGIN:VCALENDAR\r\nSUMMARY:Long\r\n\tcontinued\r\n"),
        "BEGIN:VCALENDAR\r\nSUMMARY:Longcontinued\r\n"
    );
});

test("clips recurrence while preserving alarms, attendees, and timezones", () => {
    const calendar = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//iCalStripper test//EN",
        "BEGIN:VTIMEZONE",
        "TZID:America/New_York",
        "BEGIN:STANDARD",
        "DTSTART:20261101T020000",
        "TZOFFSETFROM:-0400",
        "TZOFFSETTO:-0500",
        "END:STANDARD",
        "END:VTIMEZONE",
        "BEGIN:VEVENT",
        "UID:keep-series",
        "DTSTART;TZID=America/New_York:20261101T090000",
        "DTEND;TZID=America/New_York:20261101T100000",
        "SUMMARY:Recurring event",
        "RRULE:FREQ=WEEKLY;COUNT=8;BYDAY=SU",
        "EXDATE;TZID=America/New_York:20261108T090000",
        "EXDATE;TZID=America/New_York:20261122T090000",
        "ATTENDEE;CN=Alex;ROLE=REQ-PARTICIPANT:mailto:alex@example.com",
        "ATTENDEE;CN=Sam;ROLE=OPT-PARTICIPANT:mailto:sam@example.com",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "TRIGGER:-PT15M",
        "DESCRIPTION:Reminder",
        "END:VALARM",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:remove-me",
        "DTSTART:20261203T090000Z",
        "DTEND:20261203T100000Z",
        "SUMMARY:Outside date range",
        "END:VEVENT",
        "END:VCALENDAR",
        ""
    ].join("\r\n");

    const output = stripICalendarEvents(
        calendar,
        new Date(2026, 10, 1),
        new Date(2026, 10, 29, 23, 59, 59, 999)
    );

    assert.match(output, /UID:keep-series/);
    assert.doesNotMatch(output, /RRULE:|EXDATE;/);
    assert.match(output, /DTSTART;TZID=America\/New_York:20261101T090000/);
    assert.match(output, /RDATE;TZID=America\/New_York:20261115T090000,20261129T090000/);
    assert.equal((output.match(/ATTENDEE;/g) || []).length, 2);
    assert.match(output, /BEGIN:VALARM[\s\S]*TRIGGER:-PT15M[\s\S]*END:VALARM/);
    assert.match(output, /BEGIN:VTIMEZONE[\s\S]*TZID:America\/New_York[\s\S]*END:VTIMEZONE/);
    assert.doesNotMatch(output, /UID:remove-me/);
    assert.match(output, /END:VCALENDAR\r\n$/);
});

test("keeps all-day events through the selected end date", () => {
    const calendar = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//iCalStripper test//EN",
        "BEGIN:VEVENT",
        "UID:all-day",
        "DTSTART;VALUE=DATE:20261101",
        "DTEND;VALUE=DATE:20261102",
        "SUMMARY:All day",
        "END:VEVENT",
        "END:VCALENDAR",
        ""
    ].join("\r\n");

    const output = stripICalendarEvents(
        calendar,
        new Date(2026, 10, 1),
        new Date(2026, 10, 1, 23, 59, 59, 999)
    );
    assert.match(output, /UID:all-day/);
});

test("expands all-day recurrences to only the selected dates", () => {
    const calendar = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//iCalStripper test//EN",
        "BEGIN:VEVENT",
        "UID:all-day-series",
        "DTSTART;VALUE=DATE:20261030",
        "DTEND;VALUE=DATE:20261031",
        "RRULE:FREQ=DAILY;COUNT=4",
        "SUMMARY:All-day series",
        "END:VEVENT",
        "END:VCALENDAR",
        ""
    ].join("\r\n");
    const output = stripICalendarEvents(
        calendar,
        new Date(2026, 10, 1),
        new Date(2026, 10, 2, 23, 59, 59, 999)
    );

    assert.match(output, /DTSTART;VALUE=DATE:20261101/);
    assert.match(output, /RDATE;VALUE=DATE:20261102/);
    assert.match(output, /DTEND;VALUE=DATE:20261102/);
    assert.doesNotMatch(output, /RRULE:/);
});

test("clips explicit RDATE sets and applies EXDATE exclusions", () => {
    const calendar = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//iCalStripper test//EN",
        "BEGIN:VEVENT",
        "UID:rdate-series",
        "DTSTART:20261201T090000Z",
        "DTEND:20261201T100000Z",
        "RDATE:20261202T090000Z,20261204T090000Z",
        "EXDATE:20261204T090000Z",
        "SUMMARY:Explicit dates",
        "END:VEVENT",
        "END:VCALENDAR",
        ""
    ].join("\r\n");
    const output = stripICalendarEvents(
        calendar,
        new Date(2026, 11, 1),
        new Date(2026, 11, 3, 23, 59, 59, 999)
    );

    assert.match(output, /DTSTART:20261201T090000Z/);
    assert.match(output, /RDATE:20261202T090000Z/);
    assert.doesNotMatch(output, /20261204|EXDATE:/);
});

test("clips a TZID recurrence with an inclusive UTC UNTIL date", () => {
    const calendar = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//iCalStripper test//EN",
        "BEGIN:VEVENT",
        "UID:until-series",
        "DTSTART;TZID=America/New_York:20261101T090000",
        "DTEND;TZID=America/New_York:20261101T100000",
        "RRULE:FREQ=DAILY;UNTIL=20261104T140000Z",
        "SUMMARY:Until series",
        "END:VEVENT",
        "END:VCALENDAR",
        ""
    ].join("\r\n");
    const output = stripICalendarEvents(
        calendar,
        new Date(2026, 10, 2),
        new Date(2026, 10, 5, 23, 59, 59, 999)
    );

    assert.match(output, /DTSTART;TZID=America\/New_York:20261102T090000/);
    assert.match(output, /RDATE;TZID=America\/New_York:20261103T090000,20261104T090000/);
    assert.doesNotMatch(output, /20261105/);
});

test("keeps moved recurrence overrides as standalone in-range events", () => {
    const calendar = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//iCalStripper test//EN",
        "BEGIN:VEVENT",
        "UID:series",
        "DTSTART:20261201T090000Z",
        "DTEND:20261201T100000Z",
        "RRULE:FREQ=DAILY;COUNT=5",
        "SUMMARY:Series",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:series",
        "RECURRENCE-ID:20261202T090000Z",
        "DTSTART:20261204T120000Z",
        "DTEND:20261204T130000Z",
        "SUMMARY:Moved exception",
        "END:VEVENT",
        "END:VCALENDAR",
        ""
    ].join("\r\n");
    const output = stripICalendarEvents(
        calendar,
        new Date(2026, 11, 4),
        new Date(2026, 11, 4, 23, 59, 59, 999)
    );

    assert.equal((output.match(/BEGIN:VEVENT/g) || []).length, 2);
    assert.match(output, /SUMMARY:Moved exception/);
    assert.doesNotMatch(output, /RECURRENCE-ID:/);
    assert.equal((output.match(/UID:/g) || []).length, 2);
});

test("parses parameterized date properties and validates malformed dates", () => {
    const property = parseICalPropertyLine("DTSTART;TZID=America/New_York:20260701T090000");
    assert.deepEqual(property, {
        key: "DTSTART;TZID=America/New_York",
        value: "20260701T090000"
    });
    assert.equal(parseICalDate(property).allDay, false);
    assert.throws(() => parseICalDate({ key: "DTSTART;VALUE=DATE", value: "20260230" }));
});

test("rejects malformed calendars and events", () => {
    assert.throws(() => stripICalendarEvents("BEGIN:VCALENDAR\r\nEND:VEVENT", new Date(), new Date()));

    const missingStart = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//iCalStripper test//EN",
        "BEGIN:VEVENT",
        "UID:missing-start",
        "END:VEVENT",
        "END:VCALENDAR"
    ].join("\r\n");
    assert.throws(() => stripICalendarEvents(missingStart, new Date(), new Date()), /missing DTSTART/);
});
