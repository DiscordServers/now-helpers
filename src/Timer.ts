import Time from './Time';

export default class Timer {
    private times: { [key: string]: { [key: string]: Time } } = {};

    public start(name: string, subSection: string = 'main') {
        if (!this.times[name]) {
            this.times[name] = {};
        }
        this.times[name][subSection] = new Time();
    }

    public finish(name: string, subSection: string = 'main') {
        this.times[name][subSection].finish();
    }

    public get(name: string, subSection: string = 'main') {
        return this.times[name][subSection];
    }
}
