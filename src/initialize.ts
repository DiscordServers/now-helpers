require('dotenv').config({path: '../../.env'});

import Sentry from '@sentry/node';
import {Registry} from 'async-prometheus-client';
import {IncomingMessage, ServerResponse} from 'http';
import {RequestHandler, send} from 'micro';
import parseQuery from 'micro-query';
import redirect from 'micro-redirect';
import rp from 'request-promise';
import cors from './cors';

import {initialize as initializeSecretary} from './getSecret';
import prometheus from './prometheus';
import Timer from './Timer';

export interface Options {
    route: string;
    metricNamespace: string;
    requireAuth?: boolean;
    attemptAuth?: boolean;
    sentryDsn?: string;
    defaultHeaders?: { [key: string]: string };
    secretManager: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    redisConfig: {
        dsnSecret: [string, string];
        authSecret: [string, string];
        db: number;
    };
}

export default (optionsPromise: Options | Promise<Options>) => (handler: RequestHandler) => cors(async (
    req: Request,
    res: Response,
) => {
    const options: Options = typeof optionsPromise['then'] === 'function'
                             ? await optionsPromise
                             : optionsPromise as Options;
    console.log({options});

    await initializeSecretary(options.secretManager);

    if (options.sentryDsn) {
        Sentry.init({dsn: options.sentryDsn});
        Sentry.Handlers.requestHandler()(req, res, () => {
        });
    }

    for (const [header, value] of Object.entries(options.defaultHeaders || {})) {
        res.setHeader(header, value);
    }

    try {
        res.registry = await prometheus.initializeMetrics(options.metricNamespace, options.redisConfig);
    } catch (e) {
        console.error('Error initializing metrics: ', e);
    }

    req.query = parseQuery(req);
    res.route = options.route;
    res.times = new Timer();
    res.times.start('full');

    if ((options.requireAuth || options.attemptAuth) && req.headers.cookie) {
        req.user = await rp({
            uri:     'https://auth.discordservers.com/info',
            method:  'get',
            json:    true,
            headers: {
                cookie: req.headers.cookie,
            },
        });
    }

    res.send = async (statusCode: number, data: any, headers: { [key: string]: any } = {}) => {
        res.times.finish('full');

        for (const [key, value] of Object.entries(headers)) {
            res.setHeader(key, value);
        }

        try {
            if (res.registry) {
                await Promise.all([
                    prometheus.counters[`routeStatus${statusCode}`].inc([res.route, process.env.AWS_REGION]),
                    prometheus.counters.routeRequests.inc([res.route, process.env.AWS_REGION]),
                    prometheus.gauges.routeMemory.set(
                        process.memoryUsage().heapUsed,
                        [res.route, process.env.AWS_REGION],
                    ),
                    prometheus.gauges.routeTiming.set(
                        Date.now() - res.times.get('full').start,
                        [res.route, process.env.AWS_REGION],
                    ),
                    prometheus.counters.refererRequests.inc([req.headers.referer, process.env.AWS_REGION]),
                ]);
            }
        } catch (e) {
            console.log('Error logging request to prometheus: ', e);
        }

        if (typeof data === 'object' && req.query.profile) {
            data.times = res.times;
        }

        return send(res, statusCode, data);
    };

    res.error = (error: any, data: any = null, statusCode: number = 500, headers = {}) => {
        if (options.sentryDsn) {
            Sentry.captureException(error || data || statusCode);
        }

        return res.send(statusCode, data, headers);
    };

    res.redirect = (location: string, statusCode: number = 301) => redirect(res, statusCode, location);

    if (options.requireAuth === true && !req.user) {
        return res.send(403, {status: 'unauthorized'});
    }

    return handler(req, res);
});

export interface Request extends IncomingMessage {
    user: UserInterface;
    query: { [key: string]: string | any };
}

export interface UserInterface {
    id: string;
    username: string;
    discriminator: string;
    access_token: string;
    refresh_token: string;
    email?: string;
}

export interface Response extends ServerResponse {
    registry: Registry;
    route: string;
    times: Timer;
    redirect: (location: string, statusCode?: number) => Promise<void>;
    send: (statusCode: number, data: any, headers?: { [key: string]: string }) => Promise<void>;
    error: (error: any, data?: any, statusCode?: number, headers?: { [key: string]: string }) => Promise<void>;
}
