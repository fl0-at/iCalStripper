class DateRangePicker {
    private readonly minimum = new Date(1920, 10, 6);
    private readonly overlay = document.createElement("div");
    private readonly panel = document.createElement("div");
    private readonly heading = document.createElement("button");
    private readonly previous = document.createElement("button");
    private readonly next = document.createElement("button");
    private readonly grid = document.createElement("div");
    private readonly status = document.createElement("div");
    private readonly weekdays = document.createElement("div");
    private readonly months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    private start: Date;
    private end: Date | null;
    private cursor: Date;
    private view: "days" | "months" | "years" = "days";
    private selectingEnd = false;

    constructor(private readonly input: HTMLInputElement, private readonly onChange: (complete: boolean) => void) {
        this.start = this.today();
        this.end = this.addDays(this.start, 1);
        this.cursor = new Date(this.start);
        this.overlay.className = "datepicker-overlay";
        this.overlay.hidden = true;
        this.panel.className = "date-range-picker";
        this.panel.id = "date-range-dialog";
        this.panel.setAttribute("role", "dialog");
        this.panel.setAttribute("aria-modal", "true");
        this.panel.setAttribute("aria-label", "Choose a date range");
        this.input.setAttribute("aria-haspopup", "dialog");
        this.input.setAttribute("aria-controls", this.panel.id);
        this.input.setAttribute("aria-expanded", "false");

        const header = document.createElement("div");
        header.className = "datepicker-header";
        this.previous.type = this.next.type = this.heading.type = "button";
        this.previous.textContent = "<";
        this.next.textContent = ">";
        this.heading.className = "datepicker-heading";
        header.append(this.previous, this.heading, this.next);
        this.weekdays.className = "datepicker-weekdays";
        for (const day of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]) {
            const label = document.createElement("span");
            label.textContent = day;
            this.weekdays.append(label);
        }
        this.grid.className = "datepicker-grid";
        this.status.className = "datepicker-status";
        this.status.setAttribute("aria-live", "polite");
        const close = document.createElement("button");
        close.type = "button";
        close.className = "button button-secondary datepicker-close";
        close.textContent = "Close";
        close.addEventListener("click", () => this.close());
        this.panel.append(header, this.weekdays, this.grid, this.status, close);
        this.overlay.append(this.panel);
        document.body.append(this.overlay);

        this.input.addEventListener("click", () => this.open());
        this.input.addEventListener("keydown", event => {
            if (["Enter", " ", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                this.open();
            }
        });
        this.previous.addEventListener("click", () => this.navigate(-1));
        this.next.addEventListener("click", () => this.navigate(1));
        this.heading.addEventListener("click", () => {
            this.view = this.view === "days" ? "months" : "years";
            this.render(true);
        });
        this.overlay.addEventListener("click", event => {
            if (event.target === this.overlay) this.close();
        });
        this.panel.addEventListener("keydown", event => this.onKeyDown(event));
        this.updateInput();
    }

    getRange(): { start: Date; end: Date } | null {
        return this.end ? { start: new Date(this.start), end: new Date(this.end) } : null;
    }

    private today(): Date {
        const date = new Date();
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    private addDays(date: Date, amount: number): Date {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
    }

    private format(date: Date): string {
        return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
    }

    private updateInput(): void {
        this.input.value = this.format(this.start) + (this.end ? ` - ${this.format(this.end)}` : "");
        this.onChange(this.end !== null);
    }

    private open(): void {
        if (this.input.disabled || !this.overlay.hidden) return;
        this.cursor = new Date(this.start);
        this.view = "days";
        this.overlay.hidden = false;
        this.input.setAttribute("aria-expanded", "true");
        this.render(true);
    }

    close(): void {
        this.overlay.hidden = true;
        this.input.setAttribute("aria-expanded", "false");
        this.input.focus();
    }

    private navigate(direction: number): void {
        if (this.view === "days") {
            this.cursor = new Date(this.cursor.getFullYear(), this.cursor.getMonth() + direction, 1);
        } else {
            this.cursor = new Date(this.cursor.getFullYear() + direction * (this.view === "years" ? 12 : 1), this.cursor.getMonth(), 1);
        }
        if (this.cursor < this.minimum) this.cursor = new Date(this.minimum);
        this.render();
    }

    private choose(date: Date): void {
        if (date < this.minimum) date = new Date(this.minimum);
        this.cursor = date;
        if (this.view !== "days") {
            this.view = this.view === "years" ? "months" : "days";
            this.render(true);
            return;
        }
        if (!this.selectingEnd) {
            this.start = date;
            this.end = null;
            this.selectingEnd = true;
        } else {
            this.end = date < this.start ? this.start : date;
            this.start = date < this.start ? date : this.start;
            this.selectingEnd = false;
        }
        this.updateInput();
        if (this.end) this.close();
        else this.render(true);
    }

    private render(focus = false): void {
        const year = this.cursor.getFullYear();
        const month = this.cursor.getMonth();
        const firstYear = Math.floor(year / 12) * 12;
        this.heading.textContent = this.view === "days" ? `${this.months[month]} ${year}`
            : this.view === "months" ? String(year) : `${firstYear} - ${firstYear + 11}`;
        this.heading.disabled = this.view === "years";
        this.heading.setAttribute("aria-label", this.view === "days" ? "Choose month" : "Choose year");
        this.previous.setAttribute("aria-label", `Previous ${this.view === "days" ? "month" : this.view === "months" ? "year" : "12 years"}`);
        this.next.setAttribute("aria-label", `Next ${this.view === "days" ? "month" : this.view === "months" ? "year" : "12 years"}`);
        this.previous.disabled = this.view === "days" ? year === 1920 && month === 10
            : this.view === "months" ? year === 1920 : firstYear <= 1920;
        this.weekdays.hidden = this.view !== "days";
        this.grid.classList.toggle("datepicker-grid-wide", this.view !== "days");
        this.grid.replaceChildren();
        const firstDay = new Date(year, month, 1);
        const firstCell = this.addDays(firstDay, -firstDay.getDay());
        const today = this.today().getTime();
        for (let index = 0; index < (this.view === "days" ? 42 : 12); index++) {
            const date = this.view === "days" ? this.addDays(firstCell, index)
                : this.view === "months" ? new Date(year, index, 1) : new Date(firstYear + index, month, 1);
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "datepicker-cell";
            cell.textContent = this.view === "days" ? String(date.getDate())
                : this.view === "months" ? this.months[index].slice(0, 3) : String(firstYear + index);
            cell.setAttribute("aria-label", this.view === "days" ? this.format(date)
                : this.view === "months" ? `${this.months[index]} ${year}` : String(firstYear + index));
            const lastDate = this.view === "days" ? date : this.view === "months"
                ? new Date(year, index + 1, 0) : new Date(firstYear + index, 11, 31);
            cell.disabled = lastDate < this.minimum;
            const isCursor = this.view === "days" ? date.getTime() === this.cursor.getTime()
                : this.view === "months" ? index === month : firstYear + index === year;
            cell.tabIndex = isCursor && !cell.disabled ? 0 : -1;
            if (this.view === "days") {
                cell.dataset.date = this.format(date);
                cell.classList.toggle("other-month", date.getMonth() !== month);
                cell.classList.toggle("in-range", !!this.end && date > this.start && date < this.end);
                const selected = date.getTime() === this.start.getTime() || date.getTime() === this.end?.getTime();
                cell.classList.toggle("selected", selected);
                cell.setAttribute("aria-pressed", String(selected));
                if (date.getTime() === today) cell.setAttribute("aria-current", "date");
                cell.addEventListener("mouseenter", () => {
                    if (!this.selectingEnd || cell.disabled) return;
                    for (const button of this.grid.querySelectorAll<HTMLButtonElement>(".datepicker-cell")) {
                        const label = button.dataset.date;
                        if (!label) continue;
                        const [day, cellMonth, cellYear] = label.split(".").map(Number);
                        const value = new Date(cellYear, cellMonth - 1, day);
                        button.classList.toggle("in-range", value > (date < this.start ? date : this.start)
                            && value < (date > this.start ? date : this.start));
                    }
                });
            }
            cell.addEventListener("click", () => this.choose(date));
            this.grid.append(cell);
        }
        this.status.textContent = this.selectingEnd ? "Choose the end date" : "Choose the start date";
        if (focus) this.grid.querySelector<HTMLButtonElement>('[tabindex="0"]')?.focus();
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
            event.preventDefault();
            this.close();
            return;
        }
        if (event.key === "Tab") {
            const buttons = Array.from(this.panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
                .filter(button => button.tabIndex >= 0);
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
            return;
        }
        if (!(event.target instanceof HTMLElement) || !event.target.classList.contains("datepicker-cell")) return;
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: this.view === "days" ? -7 : -3, ArrowDown: this.view === "days" ? 7 : 3 }[event.key];
        if (delta !== undefined) {
            event.preventDefault();
            this.cursor = this.view === "days" ? this.addDays(this.cursor, delta)
                : this.view === "months" ? new Date(this.cursor.getFullYear(), this.cursor.getMonth() + delta, 1)
                : new Date(this.cursor.getFullYear() + delta, this.cursor.getMonth(), 1);
        } else if (event.key === "PageUp" || event.key === "PageDown") {
            event.preventDefault();
            this.navigate(event.key === "PageUp" ? -1 : 1);
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            this.cursor = this.view === "days"
                ? this.addDays(this.cursor, (event.key === "Home" ? 0 : 6) - this.cursor.getDay())
                : this.view === "months" ? new Date(this.cursor.getFullYear(), event.key === "Home" ? 0 : 11, 1)
                : new Date(Math.floor(this.cursor.getFullYear() / 12) * 12 + (event.key === "Home" ? 0 : 11), this.cursor.getMonth(), 1);
        } else return;
        if (this.cursor < this.minimum) this.cursor = new Date(this.minimum);
        this.render(true);
    }
}
