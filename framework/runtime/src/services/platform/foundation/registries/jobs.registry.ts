export type JobDef = {
    name: string;
    queue: string;
    handlerToken: string;
    concurrency?: number;
};

export type ScheduleDef = {
    name: string;
    cron: string;
    jobName: string;
};

export class JobRegistry {
    private jobs: JobDef[] = [];
    private schedules: ScheduleDef[] = [];

    addJob(def: JobDef) {
        this.jobs.push(def);
    }

    addSchedule(def: ScheduleDef) {
        this.schedules.push(def);
    }

    listJobs(): readonly JobDef[] {
        return this.jobs;
    }

    listSchedules(): readonly ScheduleDef[] {
        return this.schedules;
    }
}