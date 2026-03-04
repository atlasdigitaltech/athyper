export type ServiceDef = {
    name: string;
    token: string; // token that resolves the service implementation
};

export class ServiceRegistry {
    private services: ServiceDef[] = [];

    add(def: ServiceDef) {
        this.services.push(def);
    }

    list(): readonly ServiceDef[] {
        return this.services;
    }
}