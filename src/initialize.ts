require('dotenv').config({path: '../../.env'});

import * as Sentry from '@sentry/node';
import {IncomingMessage, ServerResponse} from 'http';
import ipRangeCheck from 'ip-range-check';
import {RequestHandler, send} from 'micro';
import parseQuery from 'micro-query';
import redirect from 'micro-redirect';
import {Pushgateway} from 'prom-client';
import { getClientIp } from 'request-ip';
import rp from 'request-promise';
import cors from './cors';
import getSecret, {initialize as initializeSecretary, Secret} from './getSecret';
import prometheus from './prometheus';
import Timer from './Timer';

// @ts-ignore
import cfRanges from './cf-ranges.json';

export interface Options {
    route: string;
    metricNamespace: string;
    cfVerify?: boolean;
    requireAuth?: boolean;
    attemptAuth?: boolean;
    sentryDsn?: string | Secret;
    defaultHeaders?: { [key: string]: string };
    metricsCallback?: () => Promise<void>;
    secretManager: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    redisConfig: {
        dsnSecret: Secret;
        authSecret: Secret;
        db: number;
    };
    pushGateway: {
        clientId: Secret;
        clientSecret: Secret;
        url: Secret;
    };
    callback?: (req: Request, res: Response, handler: RequestHandler, ...restArgs) => Promise<void> | void;
}

export default (optionsPromise: () => Options | Promise<Options>) => (handler: RequestHandler) => cors(async (
    req: Request,
    res: Response,
    ...restArgs
) => {
    const options: Options = await optionsPromise();

    res.originalIP      = req.headers['x-zeit-co-forwarded-for'] as string;

    // Cloudflare check
    if (options.cfVerify) {
        const proxiedByCF = ipRangeCheck(res.originalIP, cfRanges);

        if (!proxiedByCF) {
            console.log(`Non-CF ip tried to connect: ${res.originalIP}`);
            console.log(req.headers);

            return send(res, 406, 'You are not allowed to directly connect to this deployment.');
        }

        // @TODO add a else condition that checks if the Host header corresponds with the alias/main domain
    }

    await initializeSecretary(options.secretManager);

    if (options.sentryDsn) {
        Sentry.init({
            dsn: typeof options.sentryDsn === 'object'
                 ? await getSecret(options.sentryDsn)
                 : options.sentryDsn,
        });
        Sentry.Handlers.requestHandler()(req, res, () => {
        });
    }

    for (const [header, value] of Object.entries(options.defaultHeaders || {})) {
        res.setHeader(header, value);
    }

    try {
        res.gateway = await prometheus.initializeMetrics(
            options.metricNamespace,
            options.pushGateway,
            options.metricsCallback,
        );
    } catch (e) {
        console.error('Error initializing metrics: ', e);
    }

    res.clientIP        = req.headers['cf-connecting-ip'] as string || getClientIp(req);
    res.metricNamespace = options.metricNamespace;
    req.query           = parseQuery(req);
    res.route           = options.route;
    res.times           = new Timer();
    res.times.start('full');

    if ((options.requireAuth || options.attemptAuth) && req.headers.cookie) {
        req.user = await rp({
            uri:     'https://auth.discordservers.com/info',
            method:  'get',
            json:    true,
            timeout: 5000,
            headers: {
                cookie: req.headers.cookie,
            },
        });
    }

    res.send = async (statusCode: number, data: any, headers: { [key: string]: any } = {}) => {
        return new Promise((resolve) => {
            res.times.finish('full');

            for (const [key, value] of Object.entries(headers)) {
                res.setHeader(key, value);
            }

            if (typeof data === 'object' && req.query.profile) {
                data.times = res.times;
            }

            resolve(send(res, statusCode, data));

            if (res.gateway) {
                prometheus.counters[`routeStatus${statusCode}`].inc({
                    route : res.route,
                    region: process.env.AWS_REGION,
                });
                prometheus.counters.routeRequests.inc({
                    route : res.route,
                    region: process.env.AWS_REGION,
                });
                prometheus.gauges.routeMemory.set(
                    {
                        route : res.route,
                        region: process.env.AWS_REGION,
                    },
                    process.memoryUsage().heapUsed,
                );
                prometheus.gauges.routeTiming.set(
                    {
                        route : res.route,
                        region: process.env.AWS_REGION,
                    },
                    Date.now() - res.times.get('full').start,
                );
                prometheus.counters.clientIPs.inc({
                    ip   : res.clientIP,
                    route: res.route,
                });
                res.gateway.pushAdd({jobName: `now-helpers-${res.metricNamespace}`}, (err, gatewayRes, body) => {
                    if (err) {
                        console.error(`An error has occurred while pushing to prometheus:`, err);
                        console.error(gatewayRes, body);
                    }
                });
            }
        });
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

    if (typeof options.callback === 'function') {
        await options.callback(req, res, handler, ...restArgs);
    }

    return handler(req, res, ...restArgs);
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
    clientIP: string;
    originalIP: string;
    gateway: Pushgateway;
    metricNamespace: string;
    route: string;
    times: Timer;
    redirect: (location: string, statusCode?: number) => Promise<void>;
    send: (statusCode: number, data: any, headers?: { [key: string]: string }) => Promise<void>;
    error: (error: any, data?: any, statusCode?: number, headers?: { [key: string]: string }) => Promise<void>;
}
