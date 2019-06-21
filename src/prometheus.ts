import {Counter, Gauge, Pushgateway, register} from 'prom-client';
import getSecret from './getSecret';
import { Options } from './initialize';

let   gateway: Pushgateway | null          = null;
const counters: { [key: string]: Counter } = {};
const gauges: { [key: string]: Gauge }     = {};

type pushConfigType = Options['pushGateway'];

const prometheus = {
    // tslint:disable-next-line:max-line-length
    initializeMetrics: async (_namespace: string, pushConfig: pushConfigType, callback?: (Registry) => Promise<void>) => {
        if (gateway) {
            return gateway;
        }
        console.log('Initializing Metrics.');

        gateway = new Pushgateway(await getSecret(pushConfig.url), {
            headers: {
                'CF-Access-Client-ID'    : await getSecret(pushConfig.clientId),
                'CF-Access-Client-Secret': await getSecret(pushConfig.clientSecret),
            },
        });

        gauges.routeTiming       = new Gauge({
            name      : 'route_timing',
            help      : 'The time it takes to run a route',
            labelNames: ['route', 'region'],
        });
        gauges.routeMemory       = new Gauge({
            name      : 'route_memory',
            help      : 'The request memory per route in bytes',
            labelNames: ['route', 'region'],
        });
        counters.routeRequests   = new Counter({
            name      : 'route_requests',
            help      : 'The number of requests for a route',
            labelNames: ['route', 'region'],
        });
        counters.refererRequests = new Counter({
            name      : 'referer_requests',
            help      : 'The number of requests from a referer',
            labelNames: ['referer', 'region'],
        });
        for (const status of [200, 204, 400, 401, 403, 404, 500]) {
            counters[`routeStatus${status}`] = new Counter({
                name      : 'route_status_' + status,
                help      : `The number of ${status} statuses for a route`,
                labelNames: ['route', 'region'],
            });
        }

        if (typeof callback === 'function') {
            await callback(gateway);
        }

        register.setDefaultLabels({
            instance: _namespace,
        });

        console.log('Metrics initialized');

        return gateway;
    },
    gauges,
    counters,
    gateway,
};

export default prometheus;
