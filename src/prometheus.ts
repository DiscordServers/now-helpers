import {Metrics, RedisAdapter, Registry} from 'async-prometheus-client';
import getSecret from './getSecret';

let registry: Registry | null                      = null;
const counters: { [key: string]: Metrics.Counter } = {};
const gauges: { [key: string]: Metrics.Gauge }     = {};

interface Config {
    dsnSecret: [string, string];
    authSecret: [string, string];
    db: number;
}

const prometheus = {
    initializeMetrics: async (namespace: string, config: Config) => {
        if (registry) {
            return registry;
        }
        console.log('Initializing Metrics.');

        registry                 = new Registry(new RedisAdapter({
            connect_timeout: 5000,
            url:             await getSecret(...config.dsnSecret),
            auth_pass:       await getSecret(...config.authSecret),
            db:              config.db,
        }));
        gauges.routeTiming       = registry.getOrRegisterGauge({
            namespace,
            name:   'route_timing',
            help:   'The time it takes to run a route',
            labels: ['route', 'region'],
        });
        gauges.routeMemory       = registry.getOrRegisterGauge({
            namespace,
            name:   'route_memory',
            help:   'The request memory per route in bytes',
            labels: ['route', 'region'],
        });
        counters.routeRequests   = registry.getOrRegisterCounter({
            namespace,
            name:   'route_requests',
            help:   'The number of requests for a route',
            labels: ['route', 'region'],
        });
        counters.refererRequests = registry.getOrRegisterCounter({
            namespace,
            name:   'referer_requests',
            help:   'The number of requests from a referer',
            labels: ['referer', 'region'],
        });
        for (const status of [200, 204, 400, 401, 403, 404, 500]) {
            counters[`routeStatus${status}`] = registry.getOrRegisterCounter({
                namespace,
                name:   'route_status_' + status,
                help:   `The number of ${status} statuses for a route`,
                labels: ['route', 'region'],
            });
        }

        return registry;
    },
    gauges,
    counters,
    registry,
};

export default prometheus;
