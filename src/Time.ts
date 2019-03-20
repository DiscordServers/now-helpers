export default class Time {
    public start: number = Date.now();

    public end?: number;

    public get duration(): number {
        return (this.end || Date.now()) - this.start;
    }

    public finish() {
        this.end = Date.now();
    }
}
