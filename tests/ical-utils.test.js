const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createIcsFileBuilder, parseToJSON } = require("ical-toolkit");
const {
    collectICalEvents,
    getICalProperty,
    isICalEventWithinRange,
    normalizeICalContent,
    parseICalDate,
    toICalBuilderDate
} = require("../build/ical-utils.js");

test("normalizes BOM and folded lines before parsing", () => {
    const content = [
        "\uFEFFBEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//iCalStripper test//EN",
        "BEGIN:VEVENT",
        "UID:folded",
        "DTSTART:20260701T090000Z",
        "SUMMARY:Long",
        "\tcontinued",
        "END:VEVENT",
        "END:VCALENDAR",
        ""
    ].join("\r\n");
    const parsed = parseToJSON(normalizeICalContent(content));
    const [event] = collectICalEvents(parsed);

    assert.equal(event.SUMMARY, "Longcontinued");
});

test("collects events nested in VCALENDAR and at the parsed root", () => {
    const nestedEvent = { UID: "nested" };
    const rootEvent = { UID: "root" };
    const calendar = {
        VCALENDAR: [{ VEVENT: [nestedEvent] }],
        VEVENT: [rootEvent]
    };

    assert.deepEqual(collectICalEvents(calendar), [nestedEvent, rootEvent]);
});

test("parses all-day dates with parameters and preserves their calendar day", () => {
    const event = {
        "DTSTART;VALUE=DATE": "20261101",
        "DTEND;VALUE=DATE": "20261102"
    };
    const start = parseICalDate(getICalProperty(event, "DTSTART"));
    const end = parseICalDate(getICalProperty(event, "DTEND"));
    const rangeStart = new Date(2026, 10, 1);
    const rangeEnd = new Date(2026, 10, 1, 23, 59, 59, 999);
    const builderDate = toICalBuilderDate(start);

    assert.equal(start.allDay, true);
    assert.equal(start.date.getFullYear(), 2026);
    assert.equal(start.date.getMonth(), 10);
    assert.equal(start.date.getDate(), 1);
    assert.equal(builderDate.toISOString().slice(0, 10), "2026-11-01");
    assert.equal(isICalEventWithinRange(start, end, rangeStart, rangeEnd), true);

    const builder = createIcsFileBuilder();
    builder.events.push({
        start: builderDate,
        end: toICalBuilderDate(end),
        summary: "Whole day",
        allDay: true
    });
    const output = builder.toString();
    assert.match(output, /DTSTART;VALUE=DATE:20261101/);
    assert.match(output, /DTEND;VALUE=DATE:20261102/);
});

test("parses UTC, floating, and TZID date-times without shifting wall time", () => {
    const utc = parseICalDate({ key: "DTSTART", value: "20260701T130000Z" });
    const floating = parseICalDate({ key: "DTSTART", value: "20260701T090000" });
    const zoned = parseICalDate({
        key: "DTSTART;TZID=America/New_York",
        value: "20260701T090000"
    });

    assert.equal(utc.date.toISOString(), "2026-07-01T13:00:00.000Z");
    assert.equal(floating.floating, true);
    assert.equal(floating.date.getHours(), 9);
    assert.equal(toICalBuilderDate(floating).getUTCHours(), 9);
    assert.equal(zoned.date.toISOString(), "2026-07-01T13:00:00.000Z");
});

test("rejects malformed dates and nonexistent zoned wall times", () => {
    assert.throws(() => parseICalDate({ key: "DTSTART", value: "20260230T120000Z" }));
    assert.throws(() => parseICalDate({
        key: "DTSTART;TZID=America/New_York",
        value: "20260308T023000"
    }));
});
